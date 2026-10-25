'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClasses } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { authApi, currentUserKey } from '@/lib/auth';

export function VerifyEmailForm({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const verify = useMutation({
    mutationFn: () => authApi.verifyEmail(token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: currentUserKey }),
  });

  if (verify.isSuccess) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">Your email is confirmed.</Alert>
        <Link href="/account" className={buttonClasses('primary')}>
          Go to your account
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {verify.isError && (
        <Alert tone="danger">
          {verify.error instanceof ApiError
            ? verify.error.message
            : 'Something went wrong. Please try again.'}
        </Alert>
      )}
      <p className="text-sm text-ink-muted">
        Confirming your email lets us send your tickets and lets you reset your password.
      </p>
      <Button
        pending={verify.isPending}
        onClick={() => {
          verify.mutate();
        }}
      >
        Confirm email
      </Button>
    </div>
  );
}
