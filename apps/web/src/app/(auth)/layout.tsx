import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link
          href="/"
          className="self-start font-display text-display-md font-extrabold uppercase"
          aria-label="FestPass home"
        >
          FestPass
        </Link>
        <div className="rounded-card border border-line bg-surface p-6 md:p-8">{children}</div>
      </div>
    </main>
  );
}
