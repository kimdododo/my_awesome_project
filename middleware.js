import { NextResponse } from 'next/server';

const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_source_platform',
  'utm_creative_format',
  'utm_marketing_tactic',
];

const CLICK_ID_KEYS = [
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'ttclid',
  'msclkid',
];

function pickParams(url) {
  const utm = {};
  for (const k of UTM_KEYS) {
    const v = url.searchParams.get(k);
    if (v) utm[k] = v;
  }
  const click = {};
  for (const k of CLICK_ID_KEYS) {
    const v = url.searchParams.get(k);
    if (v) click[k] = v;
  }
  return { utm, click };
}

function hasAny(obj) {
  return obj && typeof obj === 'object' && Object.keys(obj).length > 0;
}

export function middleware(req) {
  const url = new URL(req.url);
  const { utm, click } = pickParams(url);
  if (!hasAny(utm) && !hasAny(click)) return NextResponse.next();

  const res = NextResponse.next();
  const now = Date.now();
  const payload = {
    v: 1,
    capturedAt: new Date(now).toISOString(),
    url: {
      pathname: url.pathname,
      search: url.search,
    },
    utm,
    click,
  };

  // 90 days default — aligns with typical attribution windows.
  res.cookies.set('mk_utm', JSON.stringify(payload), {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 90,
  });

  // Keep a short-lived "first hit" timestamp to help session stitching.
  if (!req.cookies.get('mk_first_seen')) {
    res.cookies.set('mk_first_seen', String(now), {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 90,
    });
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api).*)'],
};

