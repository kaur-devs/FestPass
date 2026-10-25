'use client';

import { signInSchema } from '@festpass/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { authApi, currentUserKey } from '@/lib/auth';
import { applyServerErrors } from '@/lib/forms';
import { GoogleButton } from '../google-button';

interface SignInFormProps {
  redirectTo: string;
  initialError: string | undefined;
}

export function SignInForm({ redirectTo, initialError }: SignInFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState(initialError);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(signInSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      const { user } = await authApi.signIn(values);
      queryClient.setQueryData(currentUserKey, user);
      router.replace(redirectTo);
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['email', 'password']));
    }
  });

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
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Link href="/forgot-password" className="self-start text-sm text-accent-text underline">
          Forgot your password?
        </Link>
        <Button type="submit" pending={isSubmitting}>
          Sign in
        </Button>
      </form>
      <GoogleButton />
    </div>
  );
}
