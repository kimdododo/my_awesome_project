import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Silicon2 = StyleKorean.com (글로벌 K-뷰티 유통사, 550+ 브랜드 · 170+ 국가).
// 브랜드 카탈로그: /brands/  — a[href*="/brands/"] 패턴의 앵커들.
const URL = 'https://www.stylekorean.com/brands/';

export async function scrapeSilicon2({ debug = false } = {}) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    locale: 'en-US',
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  try {
    const resp = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const status = resp ? resp.status() : null;
    if (!resp || status >= 400) throw new Error(`HTTP ${status ?? 'null'} at ${URL}`);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    if (debug) {
      const html = await page.content();
      const outDir = resolve(process.cwd(), 'scripts', 'outputs');
      await mkdir(outDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const outPath = resolve(outDir, `debug-silicon2-${ts}.html`);
      await writeFile(outPath, html, 'utf8');
      console.log(`--- DEBUG: HTML 덤프 저장됨: ${outPath} ---`);
    }

    const brands = await page.evaluate(() => {
      const seen = new Set();
      const out = [];
      // 브랜드 링크 패턴: /brands/{숫자}/{slug}
      const anchors = document.querySelectorAll('a[href*="/brands/"]');
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        if (!/\/brands\/\d+\//.test(href)) continue; // 카테고리/메뉴 링크 제외
        const name = (a.textContent || '').trim();
        if (!name || name.length < 2 || name.length > 60) continue;
        if (/^\d+$/.test(name)) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name });
      }
      return out;
    });

    return {
      source: 'silicon2',
      brands,
      defaults: { p: 'A', c: [], pl: 'Silicon2(StyleKorean)' },
      sourceUrl: URL,
    };
  } finally {
    await browser.close();
  }
}
