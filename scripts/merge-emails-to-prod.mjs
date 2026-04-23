#!/usr/bin/env node
// enrich-emails.mjs 결과를 프로덕션 KV 에 머지.
//
// 실행:
//   node scripts/merge-emails-to-prod.mjs scripts/outputs/enriched-{ts}.json        # dry-run (진단만)
//   node scripts/merge-emails-to-prod.mjs scripts/outputs/enriched-{ts}.json --apply # 실제 POST

import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: existsSync(resolve(__dirname, '../.env.local')) ? resolve(__dirname, '../.env.local') : resolve(__dirname, '../.env') });

const PROD_STATE_URL = process.env.PROD_STATE_URL || 'https://kbeauty-dashboard.vercel.app/api/state';

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!file) { console.error('usage: node scripts/merge-emails-to-prod.mjs <enriched-*.json> [--apply]'); process.exit(1); }

  const raw = await readFile(file, 'utf8');
  const enriched = JSON.parse(raw);
  const withEmail = (enriched.results || []).filter((r) => r.email);
  console.log(`📄 입력 파일: ${file}`);
  console.log(`   이메일 보유 결과: ${withEmail.length}개`);

  console.log('🌐 프로덕션 state 다시 가져오는 중...');
  const resp = await fetch(PROD_STATE_URL);
  if (!resp.ok) throw new Error(`state GET 실패: ${resp.status}`);
  const state = await resp.json();
  const leads = state.data?.leads;
  if (!leads) throw new Error('leads 없음');

  const emailByBrand = new Map();
  for (const r of withEmail) emailByBrand.set(r.brand.toLowerCase(), r.email);

  let matched = 0;
  let overwritten = 0;
  let stillEmpty = 0;
  const diffs = [];
  for (const lead of leads) {
    if (lead.email?.trim()) continue;
    const candidate = emailByBrand.get(lead.brand.toLowerCase());
    if (!candidate) { stillEmpty++; continue; }
    matched++;
    diffs.push({ brand: lead.brand, email: candidate });
    if (lead.email !== candidate) overwritten++;
    lead.email = candidate;
  }

  console.log(`\n📊 diff:`);
  console.log(`   매칭된 브랜드: ${matched}`);
  console.log(`   실제 업데이트: ${overwritten}`);
  console.log(`   여전히 이메일 없음: ${stillEmpty}`);
  console.log(`\n샘플 10건:`);
  diffs.slice(0, 10).forEach((d) => console.log(`   • ${d.brand}: ${d.email}`));

  if (!apply) {
    console.log(`\n💡 dry-run 종료. 실제 반영: --apply 플래그 추가`);
    return;
  }

  console.log('\n📤 프로덕션 state POST 중...');
  const post = await fetch(PROD_STATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state.data),
  });
  const postJson = await post.json().catch(() => ({}));
  if (!post.ok) throw new Error(`state POST 실패 (${post.status}): ${JSON.stringify(postJson)}`);
  console.log(`✅ 저장 완료 (${postJson.storage}), ${postJson.savedAt}`);
}

main().catch((err) => { console.error('💥', err); process.exit(1); });
