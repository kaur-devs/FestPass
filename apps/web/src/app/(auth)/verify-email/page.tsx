import type { Metadata } from 'next';
import { Alert } from '@/components/ui/alert';
import { VerifyEmailForm } from './verify-email-form';

export const metadata: Metadata = { title: 'Confirm your email' };

export default async function VerifyEmailPage({ searchParams }: PageProps<'/verify-email'>) {
  const { token } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Confirm your email</h1>
      {typeof token === 'string' && token ? (
        <VerifyEmailForm token={token} />
      ) : (
        <Alert tone="danger">
          This confirmation link is incomplete. Open the link from your email again.
        </Alert>
      )}
    </div>
  );
}
