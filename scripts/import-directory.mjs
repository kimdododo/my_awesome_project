#!/usr/bin/env node
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { scrapeOliveYoung } from './sources/oliveyoung.mjs';
import { scrapeInterCharm } from './sources/intercharm.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCES = { oliveyoung: scrapeOliveYoung, intercharm: scrapeInterCharm };
const MODEL = 'claude-sonnet-4-6';

// Load env vars from .env.local (preferred) or .env
const envLocalPath = resolve(__dirname, '../.env.local');
const envPath = resolve(__dirname, '../.env');
dotenv.config({ path: existsSync(envLocalPath) ? envLocalPath : envPath });

function parseArgs(argv) {
  const args = { sources: [], debug: false };
  for (const a of argv.slice(2)) {
    if (a === '--debug') args.debug = true;
    else if (a === 'all') args.sources = Object.keys(SOURCES);
    else if (SOURCES[a]) args.sources.push(a);
    else console.warn(`⚠️  알 수 없는 인자 무시: ${a}`);
  }
  if (args.sources.length === 0) args.sources = Object.keys(SOURCES);
  return args;
}

async function loadExistingBrands() {
  const seedPath = resolve(__dirname, '../src/data/seed.js');
  const { SEED } = await import(pathToFileURL(seedPath).href);
  return SEED.l.map((b) => b.b);
}

const BATCH_SIZE = 200;

async function callWithRetry(fn, { tries = 5, baseMs = 5000 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err?.status;
      const retryable = status === 429 || status === 529 || (status >= 500 && status < 600);
      if (!retryable || i === tries - 1) throw err;
      const retryAfter = Number(err?.headers?.['retry-after']);
      const wait = retryAfter ? retryAfter * 1000 : baseMs * Math.pow(2, i);
      console.log(
        `    ⏳ ${status} 에러 — ${Math.round(wait / 1000)}s 대기 후 재시도 (${i + 1}/${tries})`
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

async function callClaudeBatch(client, { sourceName, candidates, defaults, existingNames }) {
  const systemPrompt =
    'You are a data normalizer for a K-beauty brand outreach dashboard. ' +
    'Output JSON only — no prose, no code fences.';

  const stableContext =
    `기존 dashboard에 이미 등록된 브랜드 (${existingNames.length}개):\n` +
    existingNames.join(', ');

  const variableContext = `
새로 발견한 브랜드 후보 (소스: ${sourceName}, ${candidates.length}개):
${candidates.map((c) => `- ${c.name}`).join('\n')}

다음을 수행하고 JSON 배열만 출력하세요:
1. 기존 브랜드와 같은 회사인 항목 제외 (한글/영문 변형 고려, 예: "Torriden" = "토리든", "Beauty of Joseon" = "조선미녀")
2. 후보 내부 중복 제거 (같은 브랜드 다른 표기)
3. 명백히 화장품/뷰티/헬스 브랜드가 아닌 항목 제외 (포장재 회사, 단순 OEM/ODM, 부자재, 식품, 패션잡화 등)
4. 남은 각 브랜드를 다음 형식으로 변환:
   {"b": "<브랜드명 (가능하면 영문, 없으면 한글)>", "p": "${defaults.p}", "c": ${JSON.stringify(defaults.c)}, "pl": "${defaults.pl}", "s": 0, "e": ""}

JSON 배열만 출력. 비어있으면 [] 출력.`;

  const resp = await callWithRetry(() =>
    client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: stableContext, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: variableContext },
          ],
        },
      ],
    })
  );

  const text = resp.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  let candidate = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  if (!candidate.startsWith('[')) {
    const m = candidate.match(/\[[\s\S]*\]/);
    if (m) candidate = m[0];
  }

  try {
    const parsed = JSON.parse(candidate);
    if (!Array.isArray(parsed)) throw new Error('응답이 배열이 아님');
    return { brands: parsed, usage: resp.usage };
  } catch (err) {
    console.error('❌ Claude 응답 파싱 실패. 원문:\n', text.slice(0, 500));
    throw err;
  }
}

async function normalizeWithClaude(client, args) {
  const total = args.candidates.length;
  const totalBatches = Math.ceil(total / BATCH_SIZE);
  const out = {
    brands: [],
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 },
  };

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batchNo = Math.floor(i / BATCH_SIZE) + 1;
    const batch = args.candidates.slice(i, i + BATCH_SIZE);
    if (totalBatches > 1) {
      console.log(`    배치 ${batchNo}/${totalBatches} (${batch.length}개) 처리 중...`);
    }
    const r = await callClaudeBatch(client, { ...args, candidates: batch });
    out.brands.push(...r.brands);
    out.usage.input_tokens += r.usage.input_tokens || 0;
    out.usage.output_tokens += r.usage.output_tokens || 0;
    out.usage.cache_read_input_tokens += r.usage.cache_read_input_tokens || 0;
    if (totalBatches > 1) {
      console.log(`      → ${r.brands.length}개 신규 (누적 ${out.brands.length})`);
    }
  }

  return out;
}

async function main() {
  const { sources, debug } = parseArgs(process.argv);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY가 .env.local에 설정되지 않았습니다.');
    process.exit(1);
  }

  console.log(`🎯 소스: ${sources.join(', ')}${debug ? ' (debug)' : ''}\n`);

  console.log('📚 기존 brands 로딩...');
  const existingNames = await loadExistingBrands();
  console.log(`  ${existingNames.length}개 기존 브랜드 확인\n`);

  const client = new Anthropic();
  const allNew = [];
  const summary = [];

  for (const src of sources) {
    console.log(`📡 [${src}] 스크래핑 시작...`);
    let scraped;
    try {
      scraped = await SOURCES[src]({ debug });
    } catch (err) {
      console.error(`  ❌ 실패: ${err.message}\n`);
      summary.push({ source: src, status: 'scrape_failed', error: err.message });
      continue;
    }

    console.log(`  ✓ raw ${scraped.brands.length}개 수집`);
    if (scraped.brands.length === 0) {
      console.log('  ⚠️  결과가 비어있음 — 셀렉터를 확인하세요 (--debug 플래그 시도)\n');
      summary.push({ source: src, status: 'empty', raw: 0 });
      continue;
    }

    const lower = new Set(existingNames.map((n) => n.toLowerCase()));
    const localFiltered = scraped.brands.filter((b) => !lower.has(b.name.toLowerCase()));
    console.log(`  ✓ 로컬 중복 제거 후 ${localFiltered.length}개`);

    if (localFiltered.length === 0) {
      summary.push({ source: src, status: 'all_existing', raw: scraped.brands.length });
      continue;
    }

    console.log('  🤖 Claude로 정제 + fuzzy 중복 제거...');
    let result;
    try {
      result = await normalizeWithClaude(client, {
        sourceName: src,
        candidates: localFiltered,
        defaults: scraped.defaults,
        existingNames,
      });
    } catch (err) {
      console.error(`  ❌ Claude 호출 실패 — 이 소스는 건너뜁니다: ${err.message}\n`);
      summary.push({
        source: src,
        status: 'claude_failed',
        error: err.message,
        raw: scraped.brands.length,
        after_local_dedupe: localFiltered.length,
      });
      continue;
    }

    const u = result.usage;
    console.log(
      `  ✅ ${result.brands.length}개 신규 (in: ${u.input_tokens}, ` +
        `cached: ${u.cache_read_input_tokens ?? 0}, out: ${u.output_tokens})\n`
    );

    allNew.push(...result.brands);
    summary.push({
      source: src,
      status: 'ok',
      raw: scraped.brands.length,
      after_local_dedupe: localFiltered.length,
      new: result.brands.length,
    });
  }

  const outputDir = resolve(__dirname, 'outputs');
  await mkdir(outputDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = resolve(outputDir, `new-brands-${ts}.json`);
  await writeFile(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), summary, brands: allNew }, null, 2),
    'utf8'
  );

  console.log('═'.repeat(60));
  console.log(`✨ 완료! 신규 브랜드 합계: ${allNew.length}개`);
  console.log(`📄 ${outPath}`);
  console.log('\n다음 단계:');
  console.log('  1. 위 파일 열어서 brands 배열 검토');
  console.log('  2. 마음에 드는 항목만 골라 src/data/seed.js 의 "l" 배열에 추가');
  console.log('  3. 또는 전체를 추가하려면 JSON.parse(...)로 머지');
}

main().catch((err) => {
  console.error('💥 예상치 못한 에러:', err);
  process.exit(1);
});
