import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// ick.intercharmkorea.com — legacy ASP. www.intercharmkorea.com 경로는 보통 404/403
const BASE_URL = 'https://ick.intercharmkorea.com/eng/exhibitor/exhi_list02.asp';

export async function scrapeInterCharm({ debug = false } = {}) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    locale: 'ko-KR',
  });
  const page = await context.newPage();

  try {
    const all = [];
    const seen = new Set();
    const maxPages = 80;

    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      const pageUrl = `${BASE_URL}?page=${pageNo}`;
      const resp = await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      const status = resp ? resp.status() : null;

      if (debug && (pageNo === 1 || pageNo === 2)) {
        const html = await page.content().catch(() => '');
        const outDir = resolve(process.cwd(), 'scripts', 'outputs');
        await mkdir(outDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const safe = pageUrl.replace(/https?:\/\//, '').replace(/[^\w.-]+/g, '_').slice(0, 80);
        const outPath = resolve(outDir, `debug-intercharm-${safe}-${ts}.html`);
        await writeFile(outPath, html, 'utf8');
        console.log(`--- DEBUG (${pageUrl}): status=${status ?? 'null'} ---`);
        console.log(`--- DEBUG: HTML 덤프 저장됨: ${outPath} ---`);
      }

      if (!resp || status >= 400) {
        if (pageNo === 1) throw new Error(`HTTP ${status ?? 'null'} at ${pageUrl}`);
        break;
      }

      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

      const brands = await page.evaluate(() => {
        const out = [];
        const candidates = document.querySelectorAll(
          '.exhibitor-name, .company-name, .name, td a, li a, h3, h4, .tit, .title'
        );
        for (const el of candidates) {
          const name = (el.textContent || '').trim();
          if (!name || name.length < 2 || name.length > 60) continue;
          if (/^\d+$/.test(name)) continue;
          out.push({ name });
        }
        return out;
      });

      const before = all.length;
      for (const b of brands) {
        const key = b.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(b);
      }
      if (all.length === before) break;
    }

    return {
      source: 'intercharm',
      brands: all,
      defaults: { p: 'A', c: [], pl: '인터참코리아 출품' },
      sourceUrl: BASE_URL,
    };
  } finally {
    await browser.close();
  }
}
