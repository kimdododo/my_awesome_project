import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const URL = 'https://www.oliveyoung.co.kr/store/main/getBrandList.do';

export async function scrapeOliveYoung({ debug = false } = {}) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    locale: 'ko-KR',
  });
  const page = await context.newPage();

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    if (debug) {
      const html = await page.content();
      const outDir = resolve(process.cwd(), 'scripts', 'outputs');
      await mkdir(outDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const outPath = resolve(outDir, `debug-oliveyoung-${ts}.html`);
      await writeFile(outPath, html, 'utf8');
      console.log(`--- DEBUG: HTML 덤프 저장됨: ${outPath} ---`);
      console.log('--- DEBUG: 페이지 HTML 첫 2000자 ---');
      console.log(html.slice(0, 2000));
    }

    const brands = await page.evaluate(() => {
      const seen = new Set();
      const out = [];
      const anchors = document.querySelectorAll('#Container a[data-ref-onlbrndcd]');
      for (const a of anchors) {
        const name = (a.textContent || '').trim();
        if (!name || name.length > 60) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name });
      }
      return out;
    });

    return { source: 'oliveyoung', brands, defaults: { p: 'A', c: ['Korea'], pl: 'OliveYoung' } };
  } finally {
    await browser.close();
  }
}
