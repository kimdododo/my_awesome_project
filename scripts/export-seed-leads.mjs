#!/usr/bin/env node
/**
 * Convert merged candidate JSON -> seed lead rows shape.
 *
 * Usage:
 *   node scripts/export-seed-leads.mjs --in=scripts/outputs/merged-candidates-shortlist-....json
 *   node scripts/export-seed-leads.mjs --in=... --out=... --limit=200
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

function tsSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function parseArg(name) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : null;
}

function toSeedLead(candidate) {
  const name = String(candidate?.name || '').trim();
  const source = candidate?.source || 'unknown';
  if (!name) return null;

  const defaults =
    source === 'oliveyoung'
      ? { p: 'A', c: ['Korea'], pl: 'OliveYoung' }
      : source === 'intercharm'
        ? { p: 'A', c: [], pl: '인터참코리아 출품' }
        : { p: 'A', c: [], pl: 'import' };

  return { b: name, p: defaults.p, c: defaults.c, pl: defaults.pl, s: 0, e: '' };
}

async function main() {
  const inPath = parseArg('in');
  if (!inPath) {
    console.error('❌ Missing --in=path (merged candidates JSON).');
    process.exit(1);
  }
  const outPathArg = parseArg('out');
  const limitArg = parseArg('limit');
  const limit = limitArg ? Math.max(1, Math.min(5000, Number(limitArg))) : null;

  const raw = await readFile(inPath, 'utf8');
  const json = JSON.parse(raw);
  const candidates = Array.isArray(json?.candidates) ? json.candidates : [];

  const rows = [];
  for (const c of candidates) {
    const row = toSeedLead(c);
    if (row) rows.push(row);
    if (limit && rows.length >= limit) break;
  }

  const outDir = resolve(process.cwd(), 'scripts', 'outputs');
  await mkdir(outDir, { recursive: true });
  const outPath = outPathArg || resolve(outDir, `seed-leads-from-candidates-${tsSlug()}.json`);

  await writeFile(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, leads: rows }, null, 2), 'utf8');
  console.log('✅ Export complete');
  console.log(`- leads: ${rows.length}`);
  console.log(`- out: ${outPath}`);
}

main().catch((err) => {
  console.error('💥 export-seed-leads failed:', err);
  process.exit(1);
});

