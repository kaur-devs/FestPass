import { buttonClasses } from '@/components/ui/button';
import { googleSignInUrl } from '@/lib/auth';

export function GoogleButton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 text-xs text-ink-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <a href={googleSignInUrl} className={buttonClasses('secondary')}>
        Continue with Google
      </a>
    </div>
  );
}
