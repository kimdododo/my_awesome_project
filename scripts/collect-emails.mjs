#!/usr/bin/env node
// 브랜드 이메일 자동 수집 스크립트 — seed.js 의 e 필드가 비어있는 브랜드 대상.
//
// 흐름:
//   1. seed.js 에서 이메일 비어있는 브랜드 추출
//   2. lib/emailCrawl.mjs 의 collectEmailsForBrands 로 위임
//   3. scripts/outputs/emails-{ts}.json 에 저장 (수동 검토 후 seed.js 머지)
//
// 실행:
//   node scripts/collect-emails.mjs                          # 전부
//   node scripts/collect-emails.mjs --brand "Haruharu Wonder" # 단일
//   node scripts/collect-emails.mjs --limit 10               # 앞에서 N개

import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { collectEmailsForBrands } from './lib/emailCrawl.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const envLocalPath = resolve(__dirname, '../.env.local');
const envPath = resolve(__dirname, '../.env');
dotenv.config({ path: existsSync(envLocalPath) ? envLocalPath : envPath });

function parseArgs(argv) {
  const args = { brand: null, limit: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--brand') args.brand = argv[++i];
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10);
  }
  return args;
}

async function loadTargetBrands({ onlyBrand, limit }) {
  const seedPath = resolve(__dirname, '../src/data/seed.js');
  const { SEED } = await import(pathToFileURL(seedPath).href);
  const seen = new Set();
  let list = SEED.l
    .filter((b) => !b.e || !b.e.trim())
    .map((b) => b.b)
    .filter((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (onlyBrand) list = list.filter((n) => n === onlyBrand);
  if (limit && limit > 0) list = list.slice(0, limit);
  return list;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY 가 .env.local 에 설정되지 않았습니다.');
    process.exit(1);
  }

  console.log('📚 seed.js 에서 이메일 비어있는 브랜드 로딩...');
  const brands = await loadTargetBrands({ onlyBrand: args.brand, limit: args.limit });
  console.log(`  ${brands.length}개 대상\n`);
  if (brands.length === 0) {
    console.log('✨ 비어있는 브랜드가 없습니다.');
    return;
  }

  const client = new Anthropic();
  const browser = await chromium.launch({ headless: true });
  let emailMap, stats;
  try {
    ({ emailMap, stats } = await collectEmailsForBrands(client, browser, brands));
  } finally {
    await browser.close();
  }

  const finalResults = brands.map((brand) => ({
    brand,
    email: emailMap.get(brand) || null,
  }));

  const outputDir = resolve(__dirname, 'outputs');
  await mkdir(outputDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = resolve(outputDir, `emails-${ts}.json`);
  await writeFile(
    outPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), summary: stats, results: finalResults },
      null,
      2
    ),
    'utf8'
  );

  console.log('═'.repeat(60));
  console.log(`✨ 완료!`);
  console.log(`   • 찾음: ${stats.found}/${stats.total}`);
  console.log(`   • 홈페이지 불명: ${stats.noHomepage}`);
  console.log(`   • 이메일 못 찾음: ${stats.noEmail}`);
  console.log(`📄 ${outPath}`);
  console.log('\n다음 단계:');
  console.log('  1. 위 파일 열어서 results 배열 검토');
  console.log('  2. 쓸만한 것만 골라 src/data/seed.js 의 해당 브랜드 "e" 필드에 붙여넣기');
}

main().catch((err) => {
  console.error('💥 예상치 못한 에러:', err);
  process.exit(1);
});
