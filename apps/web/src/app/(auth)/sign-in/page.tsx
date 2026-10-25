import type { Metadata } from 'next';
import Link from 'next/link';
import { safeRedirectPath } from '@/lib/auth';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Sign in' };

const ERROR_MESSAGES: Record<string, string> = {
  google: 'Google sign-in did not finish. Try again, or use your email and password.',
  'google-unavailable': 'Google sign-in is not available yet. Use your email and password.',
};

export default async function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  const params = await searchParams;
  const errorKey = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-ink-muted">Book seats and find your tickets.</p>
      </div>
      <SignInForm
        redirectTo={safeRedirectPath(params.next)}
        initialError={errorKey ? ERROR_MESSAGES[errorKey] : undefined}
      />
      <p className="text-sm text-ink-muted">
        New to FestPass?{' '}
        <Link href="/sign-up" className="font-medium text-accent-text underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
