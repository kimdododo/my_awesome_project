#!/usr/bin/env node
// Gmail OAuth2 refresh token 발급 도우미 스크립트
//
// 사전 준비:
//   1. Google Cloud Console에서 OAuth 2.0 클라이언트 ID 생성 (Desktop 또는 Web 타입)
//      - 승인된 리디렉션 URI: http://localhost:53682/oauth2callback
//      - Gmail API 활성화 필요
//   2. .env.local 에 아래 2개 값 설정:
//        GMAIL_CLIENT_ID=...
//        GMAIL_CLIENT_SECRET=...
//
// 실행:
//   node scripts/gmail-auth.mjs
//
// 브라우저가 열리면 felix@madsq.net 로 로그인 → 권한 승인 → 자동으로
// refresh token 이 터미널에 출력됩니다. .env.local 의 GMAIL_REFRESH_TOKEN 에
// 붙여넣으면 완료.

import http from 'node:http';
import { URL } from 'node:url';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envLocal = resolve(__dirname, '../.env.local');
const envMain = resolve(__dirname, '../.env');
dotenv.config({ path: existsSync(envLocal) ? envLocal : envMain });

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:53682/oauth2callback';
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ .env.local 에 GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET 이 없습니다.');
  process.exit(1);
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPE);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost:53682');
    if (url.pathname !== '/oauth2callback') {
      res.writeHead(404).end('Not found');
      return;
    }
    const code = url.searchParams.get('code');
    const err = url.searchParams.get('error');
    if (err) {
      res.writeHead(400).end(`OAuth 에러: ${err}`);
      console.error('❌', err);
      server.close();
      process.exit(1);
    }
    if (!code) {
      res.writeHead(400).end('code 파라미터 없음');
      return;
    }

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenResp.json();

    if (!tokenResp.ok || !tokens.refresh_token) {
      res.writeHead(500).end('토큰 교환 실패 — 터미널 확인');
      console.error('❌ 토큰 응답:', tokens);
      console.error('   refresh_token 이 없다면 Google 계정에서 이 앱의 권한을 한 번 취소한 뒤 다시 실행하세요.');
      server.close();
      process.exit(1);
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>완료 — 터미널로 돌아가세요.</h2>');

    console.log('\n✅ Refresh token 발급 완료. 아래 값을 .env.local 에 추가하세요:\n');
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(`GMAIL_USER=felix@madsq.net\n`);
    server.close();
    process.exit(0);
  } catch (e) {
    console.error('💥', e);
    res.writeHead(500).end('서버 에러');
    server.close();
    process.exit(1);
  }
});

server.listen(53682, () => {
  console.log('🌐 브라우저가 열립니다. felix@madsq.net 로 로그인하세요.');
  console.log(`   (수동: ${authUrl.toString()})\n`);
  openBrowser(authUrl.toString());
});

function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}
