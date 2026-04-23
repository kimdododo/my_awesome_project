// 브랜드 B2B 이메일 수집 공통 헬퍼.
// collect-emails.mjs 단독 실행 + import-directory.mjs --with-emails 두 곳에서 공유.

const MODEL = 'claude-sonnet-4-6';

export const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export const EMAIL_BLACKLIST_PATTERNS = [
  /@(sentry|cloudflare|wix|shopify|google|facebook|instagram|example|domain|test|your|yourdomain|youremail|company)\./i,
  /^(webmaster|noreply|no-reply|donotreply|postmaster|mailer-daemon|abuse|daemon)@/i,
  /\.(png|jpg|jpeg|gif|webp|svg|ico|bmp|css|js|mp4|woff2?|ttf)@/i,
  /@[0-9]/,
];

export const CONTACT_PATHS = [
  '/contact', '/contact-us', '/contact_us', '/contactus',
  '/about', '/about-us', '/aboutus',
  '/company', '/company-info',
  '/business', '/partnership', '/inquiry', '/cs',
  '/en/contact', '/en/about', '/ko/contact', '/ko/about',
  '/privacy', '/privacy-policy', '/privacypolicy', '/policy',
  '/terms', '/term', '/agreement',
  '/help', '/customer', '/support',
  '/board/inquiry', '/mypage/cs',
];

export function filterEmails(emails) {
  const out = new Set();
  for (const e of emails) {
    const lower = e.toLowerCase();
    if (EMAIL_BLACKLIST_PATTERNS.some((p) => p.test(lower))) continue;
    if (lower.length > 80) continue;
    out.add(lower);
  }
  return [...out];
}

export async function callWithRetry(fn, { tries = 5, baseMs = 5000 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err?.status;
      const retryable = status === 429 || status === 529 || (status >= 500 && status < 600);
      if (!retryable || i === tries - 1) throw err;
      const retryAfter = Number(err?.headers?.['retry-after']);
      const wait = retryAfter ? retryAfter * 1000 : baseMs * Math.pow(2, i);
      console.log(`    ⏳ ${status} — ${Math.round(wait / 1000)}s 대기 후 재시도 (${i + 1}/${tries})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

// 페이지 로드 + footer lazy-load 유도 스크롤 + mailto: 별도 추출.
async function fetchAndExtract(page, url, timeoutMs = 15000) {
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    if (!resp || resp.status() >= 400) return null;
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let total = 0;
        const step = 400;
        const timer = setInterval(() => {
          window.scrollBy(0, step);
          total += step;
          if (total >= document.body.scrollHeight || total > 20000) {
            clearInterval(timer);
            resolve();
          }
        }, 150);
      });
    }).catch(() => {});
    await page.waitForTimeout(500);
    const html = await page.content();
    const mailtos = await page.evaluate(() => {
      const out = [];
      for (const a of document.querySelectorAll('a[href^="mailto:"]')) {
        const href = a.getAttribute('href') || '';
        const email = href.replace(/^mailto:/i, '').split('?')[0].trim();
        if (email) out.push(email);
      }
      return out;
    }).catch(() => []);
    return { html, mailtos };
  } catch {
    return null;
  }
}

export async function crawlBrand(page, homepage) {
  const pages = [];
  const allEmails = new Set();

  const addResult = (url, result) => {
    if (!result) return;
    pages.push({ url });
    const matches = result.html.match(EMAIL_REGEX) || [];
    for (const m of matches) allEmails.add(m);
    for (const m of result.mailtos || []) allEmails.add(m);
  };

  const base = await fetchAndExtract(page, homepage);
  addResult(homepage, base);

  if (base) {
    const linksFromHome = await page.evaluate(() => {
      const out = [];
      const keywords = [
        'contact', 'inquiry', 'business', 'partnership', 'about',
        'privacy', 'terms', 'policy', 'agreement', 'help', 'customer', 'support',
        '문의', '연락', '회사', '제휴', '개인정보', '이용약관', '고객', '사업자', '지원', '도움',
      ];
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href');
        const text = (a.textContent || '').toLowerCase();
        if (!href) continue;
        if (keywords.some((k) => href.toLowerCase().includes(k) || text.includes(k))) {
          out.push(href);
        }
      }
      return [...new Set(out)].slice(0, 12);
    }).catch(() => []);

    for (const href of linksFromHome) {
      let absolute;
      try {
        absolute = new URL(href, homepage).toString();
      } catch { continue; }
      if (pages.some((p) => p.url === absolute)) continue;
      const r = await fetchAndExtract(page, absolute);
      addResult(absolute, r);
      if (pages.length >= 10) break;
    }
  }

  if (pages.length < 5) {
    for (const path of CONTACT_PATHS) {
      if (pages.length >= 10) break;
      let absolute;
      try {
        absolute = new URL(path, homepage).toString();
      } catch { continue; }
      if (pages.some((p) => p.url === absolute)) continue;
      const r = await fetchAndExtract(page, absolute);
      addResult(absolute, r);
    }
  }

  return { pages: pages.map((p) => p.url), emails: filterEmails([...allEmails]) };
}

export async function claudeGuessHomepages(client, brands) {
  const systemPrompt =
    'You are a brand researcher for K-beauty companies. ' +
    'Output JSON only — no prose, no code fences.';

  const userText = `다음 한국 화장품/뷰티/헬스 브랜드들의 공식 홈페이지 URL을 추론해주세요.

브랜드 리스트 (${brands.length}개):
${brands.map((b, i) => `${i + 1}. ${b}`).join('\n')}

출력 형식 — JSON 객체만 (브랜드명 → URL):
{
  "브랜드명": "https://example.com",
  "모르는 브랜드": null
}

규칙:
- 정확한 공식 도메인을 알면 그것 (예: torriden.com, skin1004.com)
- 미국/글로벌 버전이 더 활성인 경우 그것
- 확실하지 않으면 null 반환 (추측 금물)
- 반드시 프로토콜(https://) 포함
- 입력된 full name 그대로 키로 사용`;

  const resp = await callWithRetry(() =>
    client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userText }],
    })
  );

  const text = resp.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  let candidate = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  if (!candidate.startsWith('{')) {
    const m = candidate.match(/\{[\s\S]*\}/);
    if (m) candidate = m[0];
  }
  const parsed = JSON.parse(candidate);
  return { map: parsed, usage: resp.usage };
}

export async function claudePickBestEmails(client, items) {
  const systemPrompt =
    'You are an email curator for a B2B cold outreach tool. ' +
    'Output JSON only — no prose, no code fences.';

  const userText = `다음 브랜드별 이메일 후보들에서 **B2B 제휴/세일즈 문의용으로 가장 적합한 이메일 1개**씩 선택해주세요.

${items.map((it, i) => `${i + 1}. ${it.brand} (${it.homepage})\n   후보: ${it.candidates.join(', ') || '(없음)'}`).join('\n')}

우선순위 (높을수록 선호):
- biz@, business@, partnership@, sales@, b2b@, global@, marketing@, export@, wholesale@
- contact@, info@, hello@, inquiry@
- 일반 고객지원용 (cs@, help@, support@) — 후순위
- 제외: admin@, privacy@, legal@, hr@, careers@, job@, press@, media@, webmaster@

출력 형식 — JSON 배열:
[
  {"brand": "Torriden", "email": "biz@torriden.com"},
  {"brand": "xyz", "email": null}
]

규칙:
- 후보가 없거나 전부 부적합하면 null
- 같은 도메인이 여러개면 가장 B2B 스러운 것
- 입력된 brand 명을 그대로 brand 필드에 사용`;

  const resp = await callWithRetry(() =>
    client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userText }],
    })
  );

  const text = resp.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  let candidate = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  if (!candidate.startsWith('[')) {
    const m = candidate.match(/\[[\s\S]*\]/);
    if (m) candidate = m[0];
  }
  const parsed = JSON.parse(candidate);
  return { list: parsed, usage: resp.usage };
}

// 고수준 오케스트레이터 — 브랜드명 배열을 받아 { brand → email } 맵 반환.
// 이메일을 찾지 못한 브랜드는 email === null.
export async function collectEmailsForBrands(client, browser, brandNames, { batchPick = 30 } = {}) {
  if (!brandNames.length) return { emailMap: new Map(), stats: { total: 0, found: 0, noHomepage: 0, noEmail: 0 } };

  console.log(`  🔮 Claude 로 홈페이지 URL 추론 (${brandNames.length}개)...`);
  const { map: homepageMap } = await claudeGuessHomepages(client, brandNames);
  const guessed = Object.values(homepageMap).filter(Boolean).length;
  console.log(`    ${guessed}/${brandNames.length} 개 홈페이지 추론됨`);

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    locale: 'ko-KR',
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  const crawlResults = [];
  let idx = 0;
  for (const brand of brandNames) {
    idx++;
    const homepage = homepageMap[brand];
    process.stdout.write(`    [${idx}/${brandNames.length}] ${brand}`);
    if (!homepage) {
      console.log(' — 홈페이지 불명 (skip)');
      crawlResults.push({ brand, homepage: null, candidates: [], reason: 'homepage_unknown' });
      continue;
    }
    try {
      const { emails } = await crawlBrand(page, homepage);
      console.log(` — ${emails.length}개 후보`);
      crawlResults.push({ brand, homepage, candidates: emails });
    } catch (err) {
      console.log(` — 크롤 실패: ${err.message}`);
      crawlResults.push({ brand, homepage, candidates: [], reason: 'crawl_failed' });
    }
  }
  await context.close();

  console.log('  🤖 Claude 로 최적 B2B 이메일 선별...');
  const emailMap = new Map();
  for (let i = 0; i < crawlResults.length; i += batchPick) {
    const slice = crawlResults.slice(i, i + batchPick).filter((r) => r.candidates.length > 0);
    if (!slice.length) continue;
    try {
      const { list } = await claudePickBestEmails(client, slice);
      for (const item of list) {
        if (item && item.brand) emailMap.set(item.brand, item.email || null);
      }
    } catch (err) {
      console.error(`    ❌ Claude 선별 실패: ${err.message}`);
    }
  }

  const found = [...emailMap.values()].filter(Boolean).length;
  const noHomepage = crawlResults.filter((r) => !r.homepage).length;
  const noEmail = crawlResults.filter((r) => r.homepage && !emailMap.get(r.brand)).length;

  return {
    emailMap,
    stats: { total: brandNames.length, found, noHomepage, noEmail },
  };
}
