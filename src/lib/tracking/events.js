export const EVENT_VERSION = 1;

export function nowIso() {
  return new Date().toISOString();
}

export function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getAnonId() {
  if (typeof window === 'undefined') return null;
  const key = 'mk:anon_id:v1';
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const id = randomId();
    window.localStorage.setItem(key, id);
    return id;
  } catch {
    return null;
  }
}

export function normalizeEventName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '_')
    .slice(0, 80);
}

export function buildEvent({ name, props, context }) {
  const eventName = normalizeEventName(name);
  return {
    v: EVENT_VERSION,
    id: randomId(),
    name: eventName || 'unknown',
    ts: nowIso(),
    props: props && typeof props === 'object' ? props : {},
    context: context && typeof context === 'object' ? context : {},
  };
}

