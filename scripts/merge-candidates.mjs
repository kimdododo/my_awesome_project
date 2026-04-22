#!/usr/bin/env node
/**
 * Merge + light-filter brand candidates from import outputs.
 *
 * Produces:
 * - scripts/outputs/merged-candidates-full-<ts>.json
 * - scripts/outputs/merged-candidates-shortlist-<ts>.json
 *
 * Notes:
 * - This DOES NOT modify src/data/seed.js automatically.
 * - OliveYoung output is huge; shortlist helps manual review.
 */
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

function tsSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function normalizeName(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\u00A0/g, ' ');
}

function keyOf(name) {
  return normalizeName(name).toLowerCase();
}

function looksLikeNoise(name) {
  // Conservative (avoid false positives). Remove obvious non-brand tokens.
  const s = normalizeName(name);
  if (!s) return true;
  if (s.length > 60) return true;
  // Single consonant/vowel, or only punctuation/digits.
  if (/^[0-9\W_]+$/.test(s)) return true;
  if (/^[ㄱ-ㅎㅏ-ㅣ]$/.test(s)) return true;
  // Site/navigation artifacts (rare but safe to exclude)
  const lower = s.toLowerCase();
  if (lower.includes('show all')) return true;
  if (lower === 'brands') return true;
  return false;
}

function scoreCandidate(name) {
  const s = normalizeName(name);
  let score = 0;
  // Prefer names that look like "brands" not generic words.
  if (/[a-z]/i.test(s)) score += 2;
  if (/[0-9]/.test(s)) score += 0.25;
  if (/[()&'.:-]/.test(s)) score += 0.5;
  if (/^[A-Z0-9 .&'()-]+$/.test(s)) score += 1; // all-latin uppercase-ish
  if (s.length >= 4 && s.length <= 24) score += 1;
  if (s.length <= 2) score -= 1;
  if (/\s/.test(s)) score -= 0.25; // multi-word slightly lower
  // Deprioritize obvious corporate suffixes (keep but lower)
  if (/\b(co\.|ltd\.|inc\.|corp\.|co,\s*ltd)\b/i.test(s)) score -= 0.75;
  return score;
}

async function loadSeedLeads() {
  const seedPath = resolve(process.cwd(), 'src', 'data', 'seed.js');
  const { SEED } = await import(pathToFileURL(seedPath).href);
  const existing = new Set(SEED.l.map((x) => keyOf(x.b)));
  return { existing, count: SEED.l.length };
}

async function latestOutputFile(match) {
  const dir = resolve(process.cwd(), 'scripts', 'outputs');
  const files = (await readdir(dir)).filter((f) => f.startsWith('new-brands-') && f.endsWith('.json'));
  const filtered = match ? files.filter((f) => f.includes(match)) : files;
  const list = filtered.sort();
  return list.length ? resolve(dir, list[list.length - 1]) : null;
}

async function readJson(p) {
  const raw = await readFile(p, 'utf8');
  return JSON.parse(raw);
}

function toUnifiedBrandRows(brands, sourceHint = 'unknown') {
  // Accept either {b,p,c,pl,...} or {name}
  return (brands || []).map((x) => {
    if (!x) return null;
    if (typeof x.b === 'string') return { name: x.b, source: sourceHint, raw: x };
    if (typeof x.name === 'string') return { name: x.name, source: sourceHint, raw: x };
    return null;
  }).filter(Boolean);
}

async function main() {
  const olivePath = (process.argv.find((a) => a.startsWith('--olive=')) || '').slice('--olive='.length) || null;
  const interPath = (process.argv.find((a) => a.startsWith('--inter=')) || '').slice('--inter='.length) || null;

  const olive = olivePath || await latestOutputFile('13-39-45') || await latestOutputFile(null);
  const inter = interPath || await latestOutputFile('13-44-05');

  if (!olive || !existsSync(olive)) {
    console.error('❌ OliveYoung output not found. Pass --olive=path or generate new-brands-*.json first.');
    process.exit(1);
  }
  if (!inter || !existsSync(inter)) {
    console.warn('⚠️  Intercharm output not found (continuing with OliveYoung only).');
  }

  const { existing, count: existingCount } = await loadSeedLeads();

  const oliveJson = await readJson(olive);
  const interJson = inter && existsSync(inter) ? await readJson(inter) : null;

  const rows = [
    ...toUnifiedBrandRows(oliveJson.brands, 'oliveyoung'),
    ...toUnifiedBrandRows(interJson?.brands, 'intercharm'),
  ];

  const stats = {
    existingSeedLeads: existingCount,
    inputs: {
      oliveFile: basename(olive),
      oliveCount: oliveJson.brands?.length ?? 0,
      interFile: inter ? basename(inter) : null,
      interCount: interJson?.brands?.length ?? 0,
    },
    removed: { emptyOrNoise: 0, alreadyInSeed: 0, duped: 0 },
  };

  const seen = new Set();
  const merged = [];
  for (const r of rows) {
    const name = normalizeName(r.name);
    if (looksLikeNoise(name)) { stats.removed.emptyOrNoise++; continue; }
    const k = keyOf(name);
    if (existing.has(k)) { stats.removed.alreadyInSeed++; continue; }
    if (seen.has(k)) { stats.removed.duped++; continue; }
    seen.add(k);
    merged.push({
      name,
      source: r.source,
      score: scoreCandidate(name),
    });
  }

  merged.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const shortlistSize = Number((process.argv.find((a) => a.startsWith('--top=')) || '').slice('--top='.length)) || 300;
  const shortlist = merged.slice(0, Math.max(50, Math.min(2000, shortlistSize)));

  const outDir = resolve(process.cwd(), 'scripts', 'outputs');
  await mkdir(outDir, { recursive: true });
  const ts = tsSlug();

  const fullOut = resolve(outDir, `merged-candidates-full-${ts}.json`);
  const shortOut = resolve(outDir, `merged-candidates-shortlist-${ts}.json`);

  await writeFile(
    fullOut,
    JSON.stringify({ generatedAt: new Date().toISOString(), stats, count: merged.length, candidates: merged }, null, 2),
    'utf8'
  );
  await writeFile(
    shortOut,
    JSON.stringify({ generatedAt: new Date().toISOString(), stats, count: shortlist.length, candidates: shortlist }, null, 2),
    'utf8'
  );

  console.log('✅ Merge complete');
  console.log(`- existing seed leads: ${existingCount}`);
  console.log(`- merged candidates: ${merged.length}`);
  console.log(`- shortlist: ${shortlist.length}`);
  console.log(`- full: ${fullOut}`);
  console.log(`- shortlist: ${shortOut}`);
}

main().catch((err) => {
  console.error('💥 merge-candidates failed:', err);
  process.exit(1);
});

