import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-content flex-col justify-center gap-6 px-4 py-16 md:px-6">
      <p className="font-mono text-sm text-ink-muted">Coming soon to your campus</p>
      <h1 className="font-display text-display-md font-extrabold uppercase md:text-display-lg">
        FestPass
      </h1>
      <p className="max-w-prose text-lg text-ink-muted">
        Book your seat, pay in a minute and walk through the gate with a QR ticket.
      </p>
      <div className="flex flex-col gap-3 md:flex-row">
        <Link href="/sign-up" className={buttonClasses('primary')}>
          Create an account
        </Link>
        <Link href="/sign-in" className={buttonClasses('secondary')}>
          Sign in
        </Link>
      </div>
    </main>
  );
}
