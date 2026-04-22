export const MK_UTM_COOKIE = 'mk_utm';

export function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export function getUtmFromDocumentCookie() {
  if (typeof document === 'undefined') return null;
  const raw = document.cookie
    .split(';')
    .map(s => s.trim())
    .find(s => s.startsWith(MK_UTM_COOKIE + '='));
  if (!raw) return null;
  const value = raw.slice((MK_UTM_COOKIE + '=').length);
  // Cookie value may be URI encoded depending on runtime.
  const decoded = (() => {
    try { return decodeURIComponent(value); } catch { return value; }
  })();
  return safeJsonParse(decoded);
}

export function currentPageContext() {
  if (typeof window === 'undefined') return null;
  return {
    href: window.location.href,
    pathname: window.location.pathname,
    search: window.location.search,
    referrer: document.referrer || null,
  };
}

