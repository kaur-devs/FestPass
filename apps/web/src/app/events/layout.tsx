import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/site-header';

export default function EventsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto flex max-w-content flex-col gap-8 px-4 py-8 md:px-6 md:py-12">
        {children}
      </main>
    </div>
  );
}
