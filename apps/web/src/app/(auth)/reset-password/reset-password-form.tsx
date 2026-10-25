'use client';

import { PASSWORD_MIN_LENGTH, resetPasswordSchema } from '@festpass/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClasses } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { authApi } from '@/lib/auth';
import { applyServerErrors } from '@/lib/forms';

export function ResetPasswordForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      await authApi.resetPassword(values);
      setDone(true);
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['password']));
    }
  });

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">
          Your password has been changed and you have been signed out on every device.
        </Alert>
        <Link href="/sign-in" className={buttonClasses('primary')}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {formError && <Alert tone="danger">{formError}</Alert>}
      <form
        onSubmit={(event) => {
          void onSubmit(event);
        }}
        noValidate
        className="flex flex-col gap-4"
      >
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" pending={isSubmitting}>
          Change password
        </Button>
      </form>
    </div>
  );
}
