'use client';

import type { CurrentUser } from '@festpass/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { authApi, useCurrentUser } from '@/lib/auth';

const ROLE_LABELS = { OWNER: 'Owner', ORGANIZER: 'Organizer' } as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Skeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6" aria-label="Loading your account">
      {[0, 1].map((key) => (
        <div key={key} className="h-32 animate-pulse rounded-card bg-line" />
      ))}
    </div>
  );
}

function VerifyEmailNotice() {
  const resend = useMutation({ mutationFn: authApi.resendVerification });

  if (resend.isSuccess) {
    return <Alert tone="success">A new confirmation link is on its way. Check your inbox.</Alert>;
  }
  return (
    <div className="flex flex-col gap-3 rounded-card border border-warning p-4 md:flex-row md:items-center md:justify-between">
      <p className="text-sm">
        Confirm your email address so we can send your tickets. Check your inbox for the link.
      </p>
      <Button
        variant="secondary"
        pending={resend.isPending}
        onClick={() => {
          resend.mutate();
        }}
      >
        Resend link
      </Button>
    </div>
  );
}

function SessionActions() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const onSignedOut = () => {
    queryClient.clear();
    router.replace('/sign-in');
  };
  const signOut = useMutation({ mutationFn: authApi.signOut, onSuccess: onSignedOut });
  const signOutEverywhere = useMutation({
    mutationFn: authApi.signOutEverywhere,
    onSuccess: onSignedOut,
  });

  return (
    <div className="flex flex-col gap-3 md:flex-row">
      <Button
        variant="secondary"
        pending={signOut.isPending}
        onClick={() => {
          signOut.mutate();
        }}
      >
        Sign out
      </Button>
      <Button
        variant="danger"
        pending={signOutEverywhere.isPending}
        onClick={() => {
          signOutEverywhere.mutate();
        }}
      >
        Sign out on every device
      </Button>
    </div>
  );
}

function AccountDetails({ user }: { user: CurrentUser }) {
  return (
    <div className="flex flex-col gap-6">
      {!user.emailVerified && <VerifyEmailNotice />}

      <Section title="Profile">
        <dl className="grid gap-3 text-sm md:grid-cols-[160px_1fr]">
          <dt className="text-ink-muted">Name</dt>
          <dd>{user.name}</dd>
          <dt className="text-ink-muted">Email</dt>
          <dd>
            {user.email}
            {user.emailVerified && <span className="ml-2 text-success">Confirmed</span>}
          </dd>
          <dt className="text-ink-muted">Sign-in method</dt>
          <dd>{user.hasPassword ? 'Email and password' : 'Google'}</dd>
        </dl>
      </Section>

      <Section title="Organizing teams">
        {user.organizations.length === 0 ? (
          <p className="text-sm text-ink-muted">
            You are not part of an organizing team. Ask a team owner to add you.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {user.organizations.map((organization) => (
              <li key={organization.id} className="flex justify-between py-2 text-sm">
                <span>{organization.name}</span>
                <span className="text-ink-muted">{ROLE_LABELS[organization.role]}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Volunteering">
        {user.volunteering.length === 0 ? (
          <p className="text-sm text-ink-muted">
            You are not scanning tickets at any event. Organizers can assign you to a gate.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {user.volunteering.map((assignment) => (
              <li key={assignment.eventId} className="flex justify-between py-2 text-sm">
                <span>{assignment.eventTitle}</span>
                <span className="font-mono text-ink-muted">{assignment.gate ?? 'Any gate'}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Sessions">
        <SessionActions />
      </Section>
    </div>
  );
}

export function AccountView() {
  const router = useRouter();
  const { data: user, error, isPending, refetch } = useCurrentUser();
  const signedOut = error instanceof ApiError && error.status === 401;

  useEffect(() => {
    if (signedOut) router.replace('/sign-in?next=/account');
  }, [signedOut, router]);

  if (isPending || signedOut) return <Skeleton />;
  if (error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert tone="danger">We could not load your account. Check your connection.</Alert>
        <Button variant="secondary" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  return <AccountDetails user={user} />;
}
