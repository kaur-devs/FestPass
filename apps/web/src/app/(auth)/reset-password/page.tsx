import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  const { token } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      {typeof token === 'string' && token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert tone="danger">
          This reset link is incomplete. Open the link from your email again, or{' '}
          <Link href="/forgot-password" className="underline">
            request a new one
          </Link>
          .
        </Alert>
      )}
    </div>
  );
}
