import type { Metadata } from 'next';
import Link from 'next/link';
import { SignUpForm } from './sign-up-form';

export const metadata: Metadata = { title: 'Create an account' };

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Create an account</h1>
        <p className="text-sm text-ink-muted">One account for every fest on your campus.</p>
      </div>
      <SignUpForm />
      <p className="text-sm text-ink-muted">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-medium text-accent-text underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
