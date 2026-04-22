// /api/events — dashboard usage analytics (internal)
// POST: ingest event -> store (Redis/KV/memory)
// GET : debug (recent events for today)

import { NextResponse } from 'next/server';
import { createClient } from 'redis';

export const runtime = 'nodejs';

const KEY_PREFIX = 'events:v1:'; // day partition (YYYY-MM-DD)
const DEFAULT_MAX_PER_DAY = 2000;
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 120;

let kv = null;
async function getKV() {
  if (kv !== null) return kv;
  if (!process.env.KV_REST_API_URL) {
    kv = false;
    return false;
  }
  const mod = await import('@vercel/kv');
  kv = mod.kv;
  return kv;
}

let redis = null;
async function getRedis() {
  if (redis !== null) return redis;
  const url = process.env.REDIS_URL || process.env.STORAGE_URL || process.env.REDIS_TLS_URL || process.env.STORAGE_TLS_URL;
  if (!url) {
    redis = false;
    return false;
  }
  const client = createClient({ url });
  client.on('error', () => {});
  await client.connect();
  redis = client;
  return redis;
}

const memory = new Map(); // key -> array

function dayKey(tsIso) {
  const d = typeof tsIso === 'string' ? tsIso.slice(0, 10) : new Date().toISOString().slice(0, 10);
  return KEY_PREFIX + d;
}

async function appendEvent(evt) {
  const client = await getKV();
  const r = client ? null : await getRedis();
  const key = dayKey(evt?.ts);
  const max = Number(process.env.MK_EVENTS_MAX_PER_DAY || DEFAULT_MAX_PER_DAY);

  if (client) {
    const arr = (await client.get(key)) || [];
    const next = Array.isArray(arr) ? arr : [];
    next.push(evt);
    if (next.length > max) next.splice(0, next.length - max);
    await client.set(key, next);
    return { storage: 'kv', key, count: next.length };
  }

  if (r) {
    const serialized = JSON.stringify(evt);
    await r.rPush(key, serialized);
    await r.lTrim(key, -max, -1);
    const ttl = Number(process.env.MK_EVENTS_TTL_SECONDS || DEFAULT_TTL_SECONDS);
    await r.expire(key, ttl);
    const count = await r.lLen(key);
    return { storage: 'redis', key, count };
  }

  const arr = memory.get(key) || [];
  arr.push(evt);
  if (arr.length > max) arr.splice(0, arr.length - max);
  memory.set(key, arr);
  return { storage: 'memory', key, count: arr.length };
}

async function readRecentForToday(limit = 200) {
  const key = dayKey(new Date().toISOString());
  const client = await getKV();
  const r = client ? null : await getRedis();

  if (client) {
    const arr = (await client.get(key)) || [];
    const events = Array.isArray(arr) ? arr.slice(-limit) : [];
    return { storage: 'kv', key, events };
  }

  if (r) {
    const raw = await r.lRange(key, Math.max(0, -limit), -1);
    const events = raw.map(s => {
      try { return JSON.parse(s); } catch { return null; }
    }).filter(Boolean);
    return { storage: 'redis', key, events };
  }

  const arr = memory.get(key) || [];
  return { storage: 'memory', key, events: arr.slice(-limit) };
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get('limit') || 200)));
    const out = await readRecentForToday(limit);
    return NextResponse.json({ ok: true, ...out, limit });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const evt = await req.json();
    if (!evt || typeof evt !== 'object' || typeof evt.name !== 'string' || !evt.name.trim()) {
      return NextResponse.json({ ok: false, error: 'invalid event' }, { status: 400 });
    }

    const enriched = {
      ...evt,
      server: {
        receivedAt: new Date().toISOString(),
        userAgent: req.headers.get('user-agent') || null,
        ip: req.headers.get('x-forwarded-for') || null,
      },
    };

    const store = await appendEvent(enriched);
    return NextResponse.json({
      ok: true,
      storage: store.storage,
      key: store.key,
      count: store.count,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
}

