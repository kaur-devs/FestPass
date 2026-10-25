'use client';

import { PASSWORD_MIN_LENGTH, signUpSchema } from '@festpass/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { authApi, currentUserKey } from '@/lib/auth';
import { applyServerErrors } from '@/lib/forms';
import { GoogleButton } from '../google-button';

export function SignUpForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(signUpSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      const { user } = await authApi.signUp(values);
      queryClient.setQueryData(currentUserKey, user);
      router.replace('/account');
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['name', 'email', 'password']));
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
          label="Full name"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
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
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short phrase works well.`}
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" pending={isSubmitting}>
          Create account
        </Button>
      </form>
      <GoogleButton />
    </div>
  );
}
