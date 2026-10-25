'use client';

import { forgotPasswordSchema } from '@festpass/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { authApi } from '@/lib/auth';
import { applyServerErrors } from '@/lib/forms';

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      await authApi.forgotPassword(values);
      setSentTo(values.email);
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['email']));
    }
  });

  if (sentTo) {
    return (
      <Alert tone="success">
        If an account exists for <strong>{sentTo}</strong>, a reset link is on its way. It expires
        in 1 hour.
      </Alert>
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
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <Button type="submit" pending={isSubmitting}>
          Send reset link
        </Button>
      </form>
    </div>
  );
}
