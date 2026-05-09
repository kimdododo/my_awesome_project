// brandEvents.js — append-only 이벤트 로그 (ML 학습 원료)
//
// 기존 /api/events 와 분리한 이유:
//   - /api/events: 일별 파티션 + 120일 TTL (usage analytics 용)
//   - 여기:        브랜드별 indexed, no TTL, 학습/리포트 가능 형태
//
// 저장소 우선순위 (state route 와 동일):
//   1) Vercel KV (REST)
//   2) Redis (TCP)
//   3) Upstash REST
//   4) In-memory (dev fallback)
//
// 키 구조:
//   brand_events:v1:all                — 전체 append-only (최근 N개)
//   brand_events:v1:by_brand:<slug>    — 브랜드별 (최근 N개)
//
// 이벤트 shape:
//   { id, ts, brand, type, payload, source }
//   type ∈ { send, reply, stage_change, meeting, note, enrich }

import { createClient } from 'redis';

export const ALL_KEY = 'brand_events:v1:all';
const BY_BRAND_PREFIX = 'brand_events:v1:by_brand:';

const MAX_ALL = 10000;
const MAX_PER_BRAND = 500;

const VALID_TYPES = new Set(['send', 'reply', 'stage_change', 'meeting', 'note', 'enrich']);

let kv = null;
async function getKV() {
  if (kv !== null) return kv;
  if (!process.env.KV_REST_API_URL) { kv = false; return false; }
  const mod = await import('@vercel/kv');
  kv = mod.kv;
  return kv;
}

let redis = null;
async function getRedis() {
  if (redis !== null) return redis;
  const url = process.env.REDIS_URL || process.env.STORAGE_URL || process.env.REDIS_TLS_URL || process.env.STORAGE_TLS_URL;
  if (!url) { redis = false; return false; }
  const client = createClient({ url });
  client.on('error', () => {});
  await client.connect();
  redis = client;
  return redis;
}

let upstash = null;
async function getUpstashRest() {
  if (upstash !== null) return upstash;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.STORAGE_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.STORAGE_REDIS_REST_TOKEN;
  if (!url || !token) { upstash = false; return false; }
  const { Redis } = await import('@upstash/redis');
  upstash = new Redis({ url, token });
  return upstash;
}

const memory = new Map();

function brandKey(brand) {
  const slug = String(brand).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'unknown';
  return BY_BRAND_PREFIX + slug;
}

function makeId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `bev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildBrandEvent({ brand, type, payload, source }) {
  if (!brand || typeof brand !== 'string') throw new Error('brand 필수');
  if (!VALID_TYPES.has(type)) throw new Error(`type 유효하지 않음: ${type}`);
  return {
    id: makeId(),
    ts: new Date().toISOString(),
    brand: brand.trim(),
    type,
    payload: payload && typeof payload === 'object' ? payload : {},
    source: source && typeof source === 'string' ? source : 'unknown',
  };
}

async function appendKV(client, key, evt, max) {
  const arr = (await client.get(key)) || [];
  const next = Array.isArray(arr) ? arr : [];
  next.push(evt);
  if (next.length > max) next.splice(0, next.length - max);
  await client.set(key, next);
}

async function appendUpstash(client, key, evt, max) {
  const arr = (await client.get(key)) || [];
  const next = Array.isArray(arr) ? arr : [];
  next.push(evt);
  if (next.length > max) next.splice(0, next.length - max);
  await client.set(key, next);
}

async function appendRedis(client, key, evt, max) {
  await client.rPush(key, JSON.stringify(evt));
  await client.lTrim(key, -max, -1);
}

export async function appendBrandEvent(evt) {
  const client = await getKV();
  const r = client ? null : await getRedis();
  const u = (client || r) ? null : await getUpstashRest();
  const bKey = brandKey(evt.brand);

  if (client) {
    await appendKV(client, ALL_KEY, evt, MAX_ALL);
    await appendKV(client, bKey, evt, MAX_PER_BRAND);
    return { storage: 'kv' };
  }
  if (r) {
    await appendRedis(r, ALL_KEY, evt, MAX_ALL);
    await appendRedis(r, bKey, evt, MAX_PER_BRAND);
    return { storage: 'redis' };
  }
  if (u) {
    await appendUpstash(u, ALL_KEY, evt, MAX_ALL);
    await appendUpstash(u, bKey, evt, MAX_PER_BRAND);
    return { storage: 'upstash-rest' };
  }
  const a = memory.get(ALL_KEY) || [];
  a.push(evt);
  if (a.length > MAX_ALL) a.splice(0, a.length - MAX_ALL);
  memory.set(ALL_KEY, a);
  const b = memory.get(bKey) || [];
  b.push(evt);
  if (b.length > MAX_PER_BRAND) b.splice(0, b.length - MAX_PER_BRAND);
  memory.set(bKey, b);
  return { storage: 'memory' };
}

export async function listBrandEvents({ brand, limit = 500, type, since } = {}) {
  const key = brand ? brandKey(brand) : ALL_KEY;
  const client = await getKV();
  const r = client ? null : await getRedis();
  const u = (client || r) ? null : await getUpstashRest();

  let arr = [];
  let storage = 'memory';

  if (client) {
    const raw = await client.get(key);
    arr = Array.isArray(raw) ? raw : [];
    storage = 'kv';
  } else if (r) {
    const raw = await r.lRange(key, -limit, -1);
    arr = raw.map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
    storage = 'redis';
  } else if (u) {
    const raw = await u.get(key);
    arr = Array.isArray(raw) ? raw : [];
    storage = 'upstash-rest';
  } else {
    arr = memory.get(key) || [];
  }

  let filtered = arr;
  if (type) filtered = filtered.filter(e => e.type === type);
  if (since) filtered = filtered.filter(e => e.ts >= since);
  if (filtered.length > limit) filtered = filtered.slice(-limit);
  return { events: filtered, storage, key };
}
