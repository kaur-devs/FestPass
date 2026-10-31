import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-content items-center justify-between gap-4 px-4 md:px-6"
      >
        <Link href="/" className="font-display text-2xl font-extrabold uppercase">
          FestPass
        </Link>
        <div className="flex items-center gap-4 text-sm font-medium">
          <Link href="/events">Events</Link>
          <Link href="/organize">Organize</Link>
          <Link href="/account">Account</Link>
        </div>
      </nav>
    </header>
  );
}
