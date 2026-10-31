import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';

export default function EventNotFound() {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold">We could not find that event</h1>
      <p className="text-ink-muted">
        The link may be mistyped, or the organizers have not published the event yet.
      </p>
      <Link href="/events" className={buttonClasses('secondary')}>
        See upcoming events
      </Link>
    </div>
  );
}
