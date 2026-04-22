// Gmail API 발송 래퍼 — googleapis SDK 없이 fetch로 직접 호출.
// 필요한 env:
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_USER

const FROM_NAME = 'Felix Kim';

function encodeMimeHeader(str) {
  // RFC 2047 — 한글 헤더(제목, From의 이름, 첨부 파일명 fallback) 인코딩
  return `=?UTF-8?B?${Buffer.from(str, 'utf8').toString('base64')}?=`;
}

function base64Raw(buf) {
  return Buffer.from(buf, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// base64 본문을 76자 단위로 줄바꿈 — RFC 2045
function chunkBase64(b64) {
  return b64.match(/.{1,76}/g).join('\r\n');
}

function buildTextOnlyMime({ from, to, subject, body }) {
  return [
    `From: ${encodeMimeHeader(FROM_NAME)} <${from}>`,
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
  ].join('\r\n');
}

function buildMultipartMime({ from, to, subject, body, attachment }) {
  // attachment: { filename, mimeType, content: Buffer }
  const boundary = `=_caris_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const encodedFilename = encodeMimeHeader(attachment.filename); // RFC 2047 — 대부분 클라이언트 호환
  const rfc2231Filename = `UTF-8''${encodeURIComponent(attachment.filename)}`; // RFC 2231 — Gmail/Outlook 등 현대 클라이언트

  const b64 = attachment.content.toString('base64');
  const wrapped = chunkBase64(b64);

  return [
    `From: ${encodeMimeHeader(FROM_NAME)} <${from}>`,
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
    '',
    `--${boundary}`,
    `Content-Type: ${attachment.mimeType}; name="${encodedFilename}"`,
    `Content-Disposition: attachment; filename="${encodedFilename}"; filename*=${rfc2231Filename}`,
    'Content-Transfer-Encoding: base64',
    '',
    wrapped,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

async function refreshAccessToken() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new Error('Gmail 자격증명이 설정되지 않았습니다 (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN)');
  }
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const json = await resp.json();
  if (!resp.ok || !json.access_token) {
    throw new Error(`토큰 갱신 실패: ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

export async function sendGmail({ to, subject, body, attachment }) {
  const from = process.env.GMAIL_USER;
  if (!from) throw new Error('GMAIL_USER 가 설정되지 않았습니다');
  if (!to) throw new Error('수신 이메일(to) 이 없습니다');

  const mime = attachment
    ? buildMultipartMime({ from, to, subject, body, attachment })
    : buildTextOnlyMime({ from, to, subject, body });

  const raw = base64Raw(mime);

  const accessToken = await refreshAccessToken();

  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(from)}/messages/send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    },
  );

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Gmail 발송 실패 (${resp.status}): ${JSON.stringify(json)}`);
  }
  return { id: json.id, threadId: json.threadId };
}
