import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ServiceWorker } from './service-worker';

export const metadata: Metadata = {
  title: { default: 'Gate check-in', template: '%s · FestPass Gate' },
  manifest: '/check-in.webmanifest',
  appleWebApp: { capable: true, title: 'FestPass Gate', statusBarStyle: 'black-translucent' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#1a1714',
};

export default function CheckInLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ServiceWorker />
      {children}
    </>
  );
}
