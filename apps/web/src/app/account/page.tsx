import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountView } from './account-view';

export const metadata: Metadata = { title: 'Your account' };

export default function AccountPage() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-content items-center px-4 md:px-6">
          <Link href="/" className="font-display text-2xl font-extrabold uppercase">
            FestPass
          </Link>
        </div>
      </header>
      <main className="mx-auto flex max-w-content flex-col gap-8 px-4 py-8 md:px-6 md:py-12">
        <h1 className="text-2xl font-semibold">Your account</h1>
        <AccountView />
      </main>
    </div>
  );
}
