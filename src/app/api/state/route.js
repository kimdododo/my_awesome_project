// /api/state — persistent storage for dashboard state
// GET : returns saved state (or { empty: true } if none)
// POST: saves state (body is the JSON object to save)
//
// Uses Vercel KV (Redis) when KV_REST_API_URL is set;
// falls back to in-memory Map for local dev without KV.
//
// Single shared key "state:v1" — all users share one dashboard (link-only access).

import { NextResponse } from 'next/server';

const KEY = 'state:v1';

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

// In-memory fallback (cleared on server restart — use only for local dev)
const memory = new Map();

export async function GET() {
  try {
    const client = await getKV();
    let value;
    if (client) {
      value = await client.get(KEY);
    } else {
      value = memory.get(KEY) ?? null;
    }
    if (!value) return NextResponse.json({ empty: true });
    return NextResponse.json({ data: value });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const client = await getKV();
    if (client) {
      await client.set(KEY, body);
    } else {
      memory.set(KEY, body);
    }
    return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const client = await getKV();
    if (client) await client.del(KEY);
    else memory.delete(KEY);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
