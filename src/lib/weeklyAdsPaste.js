/**
 * 엑셀에서 복사한 주간 광고 표 파싱 (탭 구분 우선, 없으면 2칸 이상 공백).
 * 헤더 행은 자동 스킵 (시작|기준|노출|주차 등 키워드).
 */

function stripMoney(s) {
  if (s == null) return '';
  return String(s).replace(/[₩,\s]/g, '').trim();
}

function parseIntLoose(s) {
  const n = parseInt(stripMoney(s), 10);
  return Number.isFinite(n) ? n : 0;
}

function parsePct(s) {
  if (s == null || s === '') return null;
  const t = String(s).replace('%', '').replace(',', '.').trim();
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return n / 100;
}

function isHeaderRow(cells) {
  const j = cells.join(' ');
  return /시작|기준일|노출|주차|연\/월|클릭|전환|CTR|CPC|광고비|채널톡|카리스/i.test(j);
}

function splitLine(line) {
  if (line.includes('\t')) return line.split('\t').map(c => c.trim());
  return line.split(/\s{2,}/).map(c => c.trim()).filter(Boolean);
}

/** ISO 날짜 YYYY-MM-DD */
function looksLikeWeekStart(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s).trim());
}

export function parseWeeklyAdsPaste(text) {
  const errors = [];
  const rows = [];
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    if (cells.length < 10) {
      errors.push('행 ' + (i + 1) + ': 열이 부족합니다 (최소 10개).');
      continue;
    }
    if (isHeaderRow(cells)) continue;
    const weekStart = cells[0];
    if (!looksLikeWeekStart(weekStart)) {
      errors.push('행 ' + (i + 1) + ': 첫 열이 YYYY-MM-DD 형식이 아닙니다.');
      continue;
    }
    const weekLabel = cells[1] || '';
    const impressions = parseIntLoose(cells[2]);
    const clicks = parseIntLoose(cells[3]);
    const adConversions = parseIntLoose(cells[4]);
    const ctr = parsePct(cells[5]);
    const cpc = parseIntLoose(cells[6]);
    const cost = parseIntLoose(cells[7]);
    const convCarisAds = parseIntLoose(cells[8]);
    const convPhone = parseIntLoose(cells[9]);
    const convChannelTalk = parseIntLoose(cells[10]);
    const totalConversions = parseIntLoose(cells[11]);
    const cpa = parseIntLoose(cells[12]);

    rows.push({
      weekStart,
      weekLabel,
      impressions,
      clicks,
      adConversions,
      ctr: ctr != null ? ctr : (impressions ? clicks / impressions : null),
      cpc,
      cost,
      convCarisAds,
      convPhone,
      convChannelTalk,
      totalConversions,
      cpa,
    });
  }

  const byWeek = new Map();
  for (const r of rows) {
    byWeek.set(r.weekStart, r);
  }
  const merged = [...byWeek.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  return { rows: merged, errors };
}
