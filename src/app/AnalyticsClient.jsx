'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { track } from '../lib/tracking/client';

export default function AnalyticsClient() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevRef = useRef(null);

  useEffect(() => {
    const search = searchParams?.toString ? searchParams.toString() : '';
    const key = pathname + (search ? `?${search}` : '');
    if (prevRef.current === key) return;
    prevRef.current = key;
    track('page_view', { pathname, search });
  }, [pathname, searchParams]);

  return null;
}

