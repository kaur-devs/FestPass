'use client';

import { type AddVolunteerInput, addVolunteerSchema, type VolunteerView } from '@festpass/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClasses } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { apiCommand, apiJson } from '@/lib/api';
import { applyServerErrors, errorMessage } from '@/lib/forms';
import { manageKeys } from '@/lib/manage';

export function VolunteersPanel({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const queryKey = [...manageKeys.event(eventId), 'volunteers'];
  const [formError, setFormError] = useState<string>();

  const volunteers = useQuery({
    queryKey,
    queryFn: async () =>
      (await apiJson<{ volunteers: VolunteerView[] }>(`/manage/events/${eventId}/volunteers`))
        .volunteers,
  });
  const add = useMutation({
    mutationFn: (input: AddVolunteerInput) =>
      apiJson<{ volunteer: VolunteerView }>(`/manage/events/${eventId}/volunteers`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const remove = useMutation({
    mutationFn: (userId: string) =>
      apiCommand(`/manage/events/${eventId}/volunteers/${userId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AddVolunteerInput>({
    resolver: zodResolver(addVolunteerSchema),
    defaultValues: { email: '', gate: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      await add.mutateAsync(values);
      reset({ email: '', gate: values.gate });
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['email', 'gate']));
    }
  });

  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Check-in team</h2>
          <p className="text-sm text-ink-muted">
            Volunteers scan tickets at the gate from their phones at{' '}
            <span className="font-mono">/check-in</span>. Add them with the email they use on
            FestPass.
          </p>
        </div>
        <Link href={`/check-in/${eventId}`} className={buttonClasses('secondary', 'shrink-0')}>
          Open scanner
        </Link>
      </div>

      {volunteers.isPending && (
        <div aria-busy className="h-16 animate-pulse rounded-control bg-line" />
      )}
      {volunteers.isError && <Alert tone="danger">{errorMessage(volunteers.error)}</Alert>}
      {volunteers.data?.length === 0 && (
        <p className="text-sm text-ink-muted">No volunteers yet. Organizers can always scan.</p>
      )}
      {volunteers.data && volunteers.data.length > 0 && (
        <ul className="divide-y divide-line">
          {volunteers.data.map((volunteer) => (
            <li
              key={volunteer.userId}
              className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between"
            >
              <span className="flex flex-col">
                <span className="font-medium">{volunteer.name}</span>
                <span className="text-sm text-ink-muted">
                  {volunteer.email}
                  {volunteer.gate && ` · ${volunteer.gate}`}
                </span>
              </span>
              <span className="flex items-center gap-4">
                <span className="text-sm">
                  <span className="font-mono">{volunteer.checkIns}</span> checked in
                </span>
                <Button
                  variant="ghost"
                  pending={remove.isPending && remove.variables === volunteer.userId}
                  onClick={() => {
                    remove.mutate(volunteer.userId);
                  }}
                >
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {remove.isError && <Alert tone="danger">{errorMessage(remove.error)}</Alert>}

      <form
        onSubmit={(formEvent) => {
          void onSubmit(formEvent);
        }}
        noValidate
        className="flex flex-col gap-4 border-t border-line pt-4"
      >
        {formError && <Alert tone="danger">{formError}</Alert>}
        <div className="grid gap-4 md:grid-cols-[2fr_1fr_auto] md:items-start">
          <TextField
            label="Volunteer email"
            type="email"
            autoComplete="off"
            error={errors.email?.message}
            {...register('email')}
          />
          <TextField
            label="Gate"
            placeholder="Gate 1"
            hint="Optional"
            error={errors.gate?.message}
            {...register('gate')}
          />
          <Button type="submit" className="md:mt-6" pending={isSubmitting}>
            Add volunteer
          </Button>
        </div>
      </form>
    </section>
  );
}
