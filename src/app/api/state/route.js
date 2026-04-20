// /api/state — persistent storage for dashboard state
// GET : returns saved state (or { empty: true } if none)
// POST: saves state (body is the JSON object to save)
//
// Storage priority:
// 1) Vercel KV (REST) when KV_REST_API_URL is set
// 2) Redis (TCP) when REDIS_URL is set (node-redis)
// 3) In-memory Map fallback (cleared on server restart — local/dev only)
//
// Single shared key "state:v1" — all users share one dashboard (link-only access).

import { NextResponse } from 'next/server';
import { createClient } from 'redis';

const KEY = 'state:v1';

export const runtime = 'nodejs';

let kv = null;
async function getKV() {
  if (kv !== null) return kv;
  if (!process.env.KV_REST_API_URL) {
    kv = false; // use in-memory fallback
    return false;
  }
  const mod = await import('@vercel/kv');
  kv = mod.kv;
  return kv;
}

let redis = null;
async function getRedis() {
  if (redis !== null) return redis;
  // Vercel Redis integration can inject REDIS_URL.
  // If the user configured a custom prefix (e.g. STORAGE), it may become STORAGE_URL.
  const url = process.env.REDIS_URL || process.env.STORAGE_URL || process.env.REDIS_TLS_URL || process.env.STORAGE_TLS_URL;
  if (!url) {
    redis = false;
    return false;
  }
  const client = createClient({ url });
  client.on('error', () => {
    // swallow: we'll surface failures via request error handling
  });
  await client.connect();
  redis = client;
  return redis;
}

let upstash = null;
async function getUpstashRest() {
  if (upstash !== null) return upstash;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.STORAGE_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.STORAGE_REDIS_REST_TOKEN;
  if (!url || !token) {
    upstash = false;
    return false;
  }
  const { Redis } = await import('@upstash/redis');
  upstash = new Redis({ url, token });
  return upstash;
}

// In-memory fallback (cleared on server restart — use only for local dev)
const memory = new Map();

export async function GET() {
  try {
    const client = await getKV();
    const r = client ? null : await getRedis();
    const u = (client || r) ? null : await getUpstashRest();
    let value;
    if (client) {
      value = await client.get(KEY);
    } else if (r) {
      const raw = await r.get(KEY);
      value = raw ? JSON.parse(raw) : null;
    } else if (u) {
      value = await u.get(KEY);
    } else {
      value = memory.get(KEY) ?? null;
    }
    const storage = client ? 'kv' : (r ? 'redis' : (u ? 'upstash-rest' : 'memory'));
    if (!value) return NextResponse.json({ empty: true, storage });
    return NextResponse.json({ data: value, storage });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const client = await getKV();
    const r = client ? null : await getRedis();
    const u = (client || r) ? null : await getUpstashRest();
    if (client) {
      await client.set(KEY, body);
    } else if (r) {
      await r.set(KEY, JSON.stringify(body));
    } else if (u) {
      await u.set(KEY, body);
    } else {
      memory.set(KEY, body);
    }
    return NextResponse.json({
      ok: true,
      storage: client ? 'kv' : (r ? 'redis' : (u ? 'upstash-rest' : 'memory')),
      savedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const client = await getKV();
    if (client) await client.del(KEY);
    else {
      const r = await getRedis();
      const u = r ? null : await getUpstashRest();
      if (r) await r.del(KEY);
      else if (u) await u.del(KEY);
      else memory.delete(KEY);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
