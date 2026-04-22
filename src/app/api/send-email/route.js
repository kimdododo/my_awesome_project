// /api/send-email — Gmail API 로 콜드메일 발송
// POST body: { brand: string, to: string }
// 본문은 서버에서 템플릿으로 렌더링 — 클라이언트가 임의 본문을 전송할 수 없음.

import { NextResponse } from 'next/server';
import { sendGmail } from '@/lib/gmail';
import { renderColdEmail } from '@/lib/email-template';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const { brand, to } = await req.json();
    if (!brand || typeof brand !== 'string') {
      return NextResponse.json({ error: 'brand 필수' }, { status: 400 });
    }
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) {
      return NextResponse.json({ error: '유효한 이메일(to) 필수' }, { status: 400 });
    }

    const { subject, body } = renderColdEmail(brand);
    const result = await sendGmail({ to: to.trim(), subject, body });

    return NextResponse.json({ ok: true, messageId: result.id, threadId: result.threadId });
  } catch (err) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
