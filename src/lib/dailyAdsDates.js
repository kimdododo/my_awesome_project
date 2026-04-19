/** 엑셀 시트의 `o`(일 오프셋)를 달력 날짜로 매핑할 기준일 — 초기값은 기존 시드와 맞춤 */
export const DAILY_AD_ANCHOR_DEFAULT = '2025-10-25';

export function dateForOffset(anchorIso, o) {
  const d = new Date(anchorIso + 'T12:00:00');
  d.setDate(d.getDate() + (Number(o) || 0));
  return d.toISOString().slice(0, 10);
}

export function offsetForDate(anchorIso, dateStr) {
  const a = new Date(anchorIso + 'T12:00:00').getTime();
  const b = new Date(dateStr + 'T12:00:00').getTime();
  return Math.round((b - a) / 86400000);
}
