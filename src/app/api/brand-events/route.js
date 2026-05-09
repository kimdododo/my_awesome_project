// /api/brand-events — append-only 브랜드 이벤트 (ML 학습 원료)
//
// POST: { brand, type, payload?, source? } -> 이벤트 1건 append
// GET ?brand=...&type=...&since=ISO&limit=500 -> 이벤트 조회
//
// 인증/스로틀 없음 — link-only 내부 대시보드 가정 (state, send-email 와 동일).

import { NextResponse } from 'next/server';
import { appendBrandEvent, buildBrandEvent, listBrandEvents } from '@/lib/brandEvents';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const body = await req.json();
    const evt = buildBrandEvent({
      brand: body?.brand,
      type: body?.type,
      payload: body?.payload,
      source: body?.source || 'dashboard',
    });
    const r = await appendBrandEvent(evt);
    return NextResponse.json({ ok: true, id: evt.id, storage: r.storage });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message || String(err) }, { status: 400 });
  }
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const brand = url.searchParams.get('brand') || undefined;
    const type = url.searchParams.get('type') || undefined;
    const since = url.searchParams.get('since') || undefined;
    const limit = Math.max(1, Math.min(2000, Number(url.searchParams.get('limit') || 500)));
    const r = await listBrandEvents({ brand, type, since, limit });
    return NextResponse.json({ ok: true, ...r, count: r.events.length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message || String(err) }, { status: 500 });
  }
}
