#!/usr/bin/env node
// 프로덕션 KV 리드 중 이메일 없는 브랜드에 이메일 자동 수집.
//
// 실행:
//   node scripts/enrich-emails.mjs                          # 전체 (수 시간)
//   node scripts/enrich-emails.mjs --limit 50               # 앞에서 50개
//   node scripts/enrich-emails.mjs --offset 500 --limit 500 # 501번째부터 500개
//   node scripts/enrich-emails.mjs --resume <progress.json> # 이전 진행분 이어서
//
// 결과:
//   scripts/outputs/enriched-{ts}.json  — { brand, email, homepage } 배열
//   스크립트 실행 도중에도 매 N개마다 점진 저장되어 중단 안전.

import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  claudeGuessHomepages,
  claudePickBestEmails,
  crawlBrand,
} from './lib/emailCrawl.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envLocalPath = resolve(__dirname, '../.env.local');
const envPath = resolve(__dirname, '../.env');
dotenv.config({ path: existsSync(envLocalPath) ? envLocalPath : envPath });

const PROD_STATE_URL = process.env.PROD_STATE_URL || 'https://kbeauty-dashboard.vercel.app/api/state';
const HOMEPAGE_BATCH = 50;  // Claude 에게 한번에 추론 요청할 브랜드 수
const EMAIL_PICK_BATCH = 30; // Claude 에게 한번에 이메일 선별 요청할 브랜드 수
const CHECKPOINT_EVERY = 25; // N개마다 중간 저장

function parseArgs(argv) {
  const args = { limit: null, offset: 0, resume: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (a === '--offset') args.offset = parseInt(argv[++i], 10);
    else if (a === '--resume') args.resume = argv[++i];
  }
  return args;
}

async function fetchProdLeads() {
  const resp = await fetch(PROD_STATE_URL);
  if (!resp.ok) throw new Error(`prod state fetch 실패: ${resp.status}`);
  const json = await resp.json();
  if (!json.data?.leads) throw new Error('prod state 에 leads 없음');
  return json.data.leads;
}

async function loadResume(file) {
  const raw = await readFile(file, 'utf8');
  const data = JSON.parse(raw);
  const done = new Set();
  for (const r of data.results || []) done.add(r.brand);
  return done;
}

function normalizeBrandForDomain(name) {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 30);
}

// HEAD/GET 으로 도메인이 살아있는지 빠른 검증 (200~399).
async function probeDomain(url) {
  try {
    const resp = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(7000) });
    if (resp.status >= 200 && resp.status < 400) return true;
  } catch {}
  try {
    const resp = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(10000) });
    return resp.status >= 200 && resp.status < 400;
  } catch {
    return false;
  }
}

// 브랜드명 기반 도메인 패턴 추측 — probing 으로 살아있는 것만 반환.
async function guessByPattern(brand) {
  const norm = normalizeBrandForDomain(brand);
  if (!norm || norm.length < 3) return null;
  const candidates = [
    `https://${norm}.com`,
    `https://${norm}.co.kr`,
    `https://www.${norm}.com`,
    `https://www.${norm}.co.kr`,
  ];
  for (const url of candidates) {
    if (await probeDomain(url)) return url;
  }
  return null;
}

async function writeCheckpoint(path, header, results) {
  await writeFile(
    path,
    JSON.stringify({ ...header, updatedAt: new Date().toISOString(), results }, null, 2),
    'utf8'
  );
}

async function main() {
  const args = parseArgs(process.argv);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY 미설정'); process.exit(1);
  }

  console.log('🌐 프로덕션 KV 에서 리드 로드...');
  const all = await fetchProdLeads();
  console.log(`  전체 ${all.length}개 중 이메일 비어있음: ${all.filter((l) => !l.email?.trim()).length}`);

  let emailless = all.filter((l) => !l.email?.trim()).map((l) => l.brand);

  // 중복 제거 (같은 이름의 브랜드가 여러 행으로 있을 수 있음)
  const uniq = [];
  const seenNames = new Set();
  for (const b of emailless) {
    const k = b.toLowerCase();
    if (seenNames.has(k)) continue;
    seenNames.add(k);
    uniq.push(b);
  }
  emailless = uniq;
  console.log(`  중복 제거 후: ${emailless.length}`);

  if (args.resume) {
    const done = await loadResume(args.resume);
    const before = emailless.length;
    emailless = emailless.filter((b) => !done.has(b));
    console.log(`  이어서 실행 — 이미 처리된 ${before - emailless.length}개 스킵 (남은 ${emailless.length})`);
  }

  if (args.offset) emailless = emailless.slice(args.offset);
  if (args.limit && args.limit > 0) emailless = emailless.slice(0, args.limit);
  console.log(`  처리 대상: ${emailless.length}개\n`);
  if (!emailless.length) { console.log('✨ 할 일 없음'); return; }

  const outputDir = resolve(__dirname, 'outputs');
  await mkdir(outputDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = resolve(outputDir, `enriched-${ts}.json`);
  const header = {
    generatedAt: new Date().toISOString(),
    prodStateUrl: PROD_STATE_URL,
    plannedCount: emailless.length,
  };
  const results = [];

  const client = new Anthropic();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    locale: 'ko-KR',
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  try {
    // ── 1단계: 패턴 추측 + Claude 추론 하이브리드로 홈페이지 해결 ──
    const homepageMap = new Map();   // brand → url | null
    const unknownForClaude = [];

    console.log('🔎 1단계: 도메인 패턴 probing (빠른 선별)...');
    let idx = 0;
    for (const brand of emailless) {
      idx++;
      const url = await guessByPattern(brand);
      if (url) {
        homepageMap.set(brand, url);
        if (idx % 50 === 0) process.stdout.write(`    ${idx}/${emailless.length} · 확인됨 ${homepageMap.size}\r`);
      } else {
        unknownForClaude.push(brand);
      }
    }
    console.log(`\n  패턴 매치: ${homepageMap.size} / Claude 위임: ${unknownForClaude.length}`);

    console.log('\n🔮 2단계: Claude 에 나머지 홈페이지 추론...');
    for (let i = 0; i < unknownForClaude.length; i += HOMEPAGE_BATCH) {
      const slice = unknownForClaude.slice(i, i + HOMEPAGE_BATCH);
      const batchNo = Math.floor(i / HOMEPAGE_BATCH) + 1;
      const totalBatches = Math.ceil(unknownForClaude.length / HOMEPAGE_BATCH);
      process.stdout.write(`  배치 ${batchNo}/${totalBatches} (${slice.length}개)...`);
      try {
        const { map } = await claudeGuessHomepages(client, slice);
        for (const [b, u] of Object.entries(map)) homepageMap.set(b, u || null);
        const found = slice.filter((b) => homepageMap.get(b)).length;
        console.log(` ${found}개 추론됨`);
      } catch (err) {
        console.log(`  ❌ ${err.message}`);
      }
    }
    const totalHomepages = [...homepageMap.values()].filter(Boolean).length;
    console.log(`  홈페이지 보유: ${totalHomepages}/${emailless.length}\n`);

    // ── 3단계: Playwright 로 상세 크롤 + 이메일 추출 ──
    console.log('🌐 3단계: 각 홈페이지 크롤링...');
    const crawled = []; // { brand, homepage, candidates }
    idx = 0;
    for (const brand of emailless) {
      idx++;
      const homepage = homepageMap.get(brand);
      process.stdout.write(`  [${idx}/${emailless.length}] ${brand.slice(0, 40)}`);
      if (!homepage) {
        console.log(' — 홈페이지 없음');
        results.push({ brand, email: null, homepage: null, reason: 'homepage_unknown' });
      } else {
        try {
          const { emails } = await crawlBrand(page, homepage);
          console.log(` — ${emails.length}개 후보`);
          crawled.push({ brand, homepage, candidates: emails });
          if (emails.length === 0) {
            results.push({ brand, email: null, homepage, reason: 'no_email_on_site' });
          }
        } catch (err) {
          console.log(` — 크롤 실패: ${err.message}`);
          results.push({ brand, email: null, homepage, reason: 'crawl_failed' });
        }
      }

      if (idx % CHECKPOINT_EVERY === 0) {
        await writeCheckpoint(outPath, header, results);
      }
    }
    await writeCheckpoint(outPath, header, results);

    // ── 4단계: Claude 이메일 선별 ──
    console.log(`\n🤖 4단계: Claude 에 B2B 이메일 선별 (${crawled.length}개 대상)...`);
    const picked = new Map();
    for (let i = 0; i < crawled.length; i += EMAIL_PICK_BATCH) {
      const slice = crawled.slice(i, i + EMAIL_PICK_BATCH).filter((r) => r.candidates.length > 0);
      if (!slice.length) continue;
      const batchNo = Math.floor(i / EMAIL_PICK_BATCH) + 1;
      const totalBatches = Math.ceil(crawled.length / EMAIL_PICK_BATCH);
      process.stdout.write(`  배치 ${batchNo}/${totalBatches}...`);
      try {
        const { list } = await claudePickBestEmails(client, slice);
        let got = 0;
        for (const item of list) {
          if (item?.brand) { picked.set(item.brand, item.email || null); if (item.email) got++; }
        }
        console.log(` ${got}개 이메일 확정`);
      } catch (err) {
        console.log(` ❌ ${err.message}`);
      }
    }

    // crawled 결과를 results 에 반영 (이미 results 에 없는 것만 추가)
    const byBrand = new Map(results.map((r) => [r.brand, r]));
    for (const { brand, homepage, candidates } of crawled) {
      const email = picked.get(brand) || null;
      const existing = byBrand.get(brand);
      const reason = email ? 'ok' : (candidates.length ? 'no_suitable_email' : 'no_email_on_site');
      if (existing) {
        existing.email = email;
        existing.homepage = homepage;
        existing.reason = reason;
        existing.candidates = candidates;
      } else {
        results.push({ brand, email, homepage, candidates, reason });
      }
    }

    await writeCheckpoint(outPath, header, results);
  } finally {
    await browser.close();
  }

  const found = results.filter((r) => r.email).length;
  const noHp = results.filter((r) => r.reason === 'homepage_unknown').length;
  const noEmail = results.filter((r) => ['no_email_on_site', 'no_suitable_email', 'crawl_failed'].includes(r.reason)).length;
  console.log('═'.repeat(60));
  console.log(`✨ 완료! 이메일 찾음: ${found}/${results.length} (${Math.round(found/results.length*100)}%)`);
  console.log(`   • 홈페이지 불명: ${noHp}`);
  console.log(`   • 이메일 없음: ${noEmail}`);
  console.log(`📄 ${outPath}`);
  console.log('\n다음 단계:');
  console.log(`  1. 결과 검토`);
  console.log(`  2. node scripts/merge-emails-to-prod.mjs ${outPath}  로 프로덕션 KV 머지`);
}

main().catch((err) => { console.error('💥', err); process.exit(1); });
