// /api/send-email — Gmail API 로 콜드메일 발송 (PDF 첨부 포함)
// POST body: { brand: string, to: string }
// 본문은 서버에서 템플릿으로 렌더링 — 클라이언트가 임의 본문을 전송할 수 없음.

import { NextResponse } from 'next/server';
import { sendGmail } from '@/lib/gmail';
import { renderColdEmail } from '@/lib/email-template';

export const runtime = 'nodejs';

const PDF_FILENAME = '2026_CHARIS_서비스소개서.pdf';

async function loadAttachment(req) {
  // public/ 에 있는 정적 자산을 자기 자신의 오리진에서 fetch로 읽어옴.
  // (Vercel 서버리스 번들에 public/ 가 포함되지 않을 수 있어 fs.readFile 보다 안전)
  const url = new URL(`/${encodeURIComponent(PDF_FILENAME)}`, req.url).toString();
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`PDF 로드 실패 (${resp.status}) — public/${PDF_FILENAME} 존재 확인`);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  return { filename: PDF_FILENAME, mimeType: 'application/pdf', content: buf };
}

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
    const attachment = await loadAttachment(req);
    const result = await sendGmail({ to: to.trim(), subject, body, attachment });

    return NextResponse.json({ ok: true, messageId: result.id, threadId: result.threadId });
  } catch (err) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
