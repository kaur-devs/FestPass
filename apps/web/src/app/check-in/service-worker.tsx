'use client';

import { useEffect } from 'react';

export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/check-in-sw.js', { scope: '/check-in' })
      .catch(() => undefined);
  }, []);

  return null;
}
