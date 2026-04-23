import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Cosmoprof CBE ASEAN Bangkok — 동남아 최대 뷰티 박람회.
// Informa 포털이 실제 exhibitor 데이터 소스. DataTables 기반 페이지네이션 사용 —
// 전체 행 표시로 전환 후 카드에서 이름 + Country/Region 파싱.
const PORTAL_URL = 'https://exhibitors.informamarkets-info.com/event/CCA25/en-US/';

export async function scrapeCosmoprofCbe({ debug = false } = {}) {
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
    const resp = await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
    const status = resp ? resp.status() : null;
    if (!resp || status >= 400) throw new Error(`HTTP ${status ?? 'null'} at ${PORTAL_URL}`);
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForSelector('h4.card-title', { timeout: 30000 }).catch(() => {});

    // DataTables: page length = -1 → 전체 행 1페이지에 렌더.
    await page.evaluate(() => {
      const $ = window.jQuery || window.$;
      if ($ && $.fn && $.fn.DataTable && $.fn.DataTable.isDataTable('#dtSearch')) {
        $('#dtSearch').DataTable().page.len(-1).draw();
      }
    }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    // 페이지 크기가 안 바뀐 경우(DataTables 인스턴스 다를 수 있음): 페이지네이션 "Next" 반복 클릭 폴백
    let prev = 0;
    for (let i = 0; i < 80; i++) {
      const now = await page.evaluate(() => document.querySelectorAll('h4.card-title').length);
      if (now === prev && i > 2) break;
      prev = now;
      const clicked = await page.evaluate(() => {
        const btn = document.querySelector(
          '.paginate_button.next:not(.disabled) a, .paginate_button.next:not(.disabled), a.paginate_button.next:not(.disabled)'
        );
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (!clicked) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 10));
      }
      await page.waitForTimeout(1200);
    }

    if (debug) {
      const html = await page.content();
      const outDir = resolve(process.cwd(), 'scripts', 'outputs');
      await mkdir(outDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const outPath = resolve(outDir, `debug-cosmoprof-${ts}.html`);
      await writeFile(outPath, html, 'utf8');
      console.log(`--- DEBUG: HTML 덤프 저장됨: ${outPath} ---`);
      console.log(`--- DEBUG: 총 카드 ${prev}개 ---`);
    }

    const all = await page.evaluate(() => {
      const out = [];
      const titles = document.querySelectorAll('h4.card-title');
      for (const title of titles) {
        const a = title.querySelector('a[href*="/exhibitor/"]');
        const rawName = ((a?.textContent) || title.textContent || '').trim();
        if (!rawName || rawName.length < 2 || rawName.length > 80) continue;

        // 카드 컨테이너에서 Country/Region span 찾기
        const card = title.closest('[role="row"]') || title.closest('div');
        let country = '';
        if (card) {
          const labels = card.querySelectorAll('.info-item label');
          for (const lab of labels) {
            if (/country|region/i.test(lab.textContent || '')) {
              const sp = lab.parentElement?.querySelector('span');
              if (sp) country = (sp.textContent || '').trim();
              break;
            }
          }
        }
        out.push({ name: rawName, country });
      }
      return out;
    });

    const seen = new Set();
    const unique = [];
    for (const b of all) {
      const key = b.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(b);
    }

    // Country/Region === "KOREA" 만 (Informa 표기)
    const korean = unique.filter((b) => /\bKOREA\b/i.test(b.country));
    const brands = korean.map((b) => ({ name: b.name }));

    if (brands.length === 0 && !debug) {
      throw new Error(
        `한국 출품사 추출 0개 — 총 카드 ${unique.length}개. --debug 로 HTML 확인 필요`
      );
    }

    return {
      source: 'cosmoprofCbe',
      brands,
      defaults: { p: 'A', c: ['Southeast Asia'], pl: 'Cosmoprof CBE ASEAN' },
      sourceUrl: PORTAL_URL,
    };
  } finally {
    await browser.close();
  }
}
