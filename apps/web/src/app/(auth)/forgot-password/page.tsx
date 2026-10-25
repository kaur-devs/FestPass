import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="text-sm text-ink-muted">
          Enter the email you signed up with and we will send you a reset link.
        </p>
      </div>
      <ForgotPasswordForm />
      <Link href="/sign-in" className="text-sm text-accent-text underline">
        Back to sign in
      </Link>
    </div>
  );
}
