import { buildEvent, getAnonId } from './events';
import { currentPageContext, getUtmFromDocumentCookie } from './utm';

function postEvent(payload) {
  const body = JSON.stringify(payload);
  // Prefer sendBeacon for reliability on navigation/unload.
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const ok = navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
      if (ok) return;
    } catch {
      // fallthrough
    }
  }
  fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function track(name, props = {}, extraContext = {}) {
  if (typeof window === 'undefined') return;
  const utm = getUtmFromDocumentCookie();
  const page = currentPageContext();
  const anonId = getAnonId();

  const evt = buildEvent({
    name,
    props,
    context: {
      anonId,
      page,
      utm,
      ...extraContext,
    },
  });

  postEvent(evt);
}

