'use client';

import {
  formatPrice,
  type ManagedEvent,
  tierSchema,
  type TierInput,
  type TierView,
} from '@festpass/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { applySchemaIssues, applyServerErrors, errorMessage } from '@/lib/forms';
import { manageApi, paiseToRupees, rupeesToPaise, useEventMutation } from '@/lib/manage';

const formSchema = z.object({
  name: z.string(),
  description: z.string(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount like 499 or 499.50.'),
  capacity: z.string(),
  maxPerOrder: z.string().regex(/^\d+$/, 'Enter a whole number.'),
});

type FormValues = z.infer<typeof formSchema>;

interface TierFormProps {
  event: ManagedEvent;
  tier?: TierView;
  onDone: () => void;
}

function TierForm({ event, tier, onDone }: TierFormProps) {
  const [formError, setFormError] = useState<string>();
  const generalAdmission = event.seatingType === 'GENERAL_ADMISSION';
  const save = useEventMutation(event.id, (input: TierInput) =>
    tier ? manageApi.updateTier(event.id, tier.id, input) : manageApi.addTier(event.id, input),
  );
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: tier?.name ?? '',
      description: tier?.description ?? '',
      price: tier ? paiseToRupees(tier.priceInPaise) : '',
      capacity: tier?.capacity?.toString() ?? '',
      maxPerOrder: String(tier?.maxPerOrder ?? 6),
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    const input: TierInput = {
      name: values.name,
      description: values.description,
      priceInPaise: rupeesToPaise(values.price),
      capacity: generalAdmission && values.capacity !== '' ? Number(values.capacity) : null,
      maxPerOrder: Number(values.maxPerOrder),
      sortOrder: tier?.sortOrder ?? event.tiers.length,
    };
    const parsed = tierSchema.safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.map((key) => (key === 'priceInPaise' ? 'price' : key)),
      }));
      setFormError(
        applySchemaIssues(issues, setError, [
          'name',
          'description',
          'price',
          'capacity',
          'maxPerOrder',
        ]),
      );
      return;
    }
    try {
      await save.mutateAsync(input);
      onDone();
    } catch (error) {
      setFormError(
        applyServerErrors(error, setError, ['name', 'description', 'capacity', 'maxPerOrder']),
      );
    }
  });

  return (
    <form
      onSubmit={(formEvent) => {
        void onSubmit(formEvent);
      }}
      noValidate
      className="flex flex-col gap-4 rounded-card border border-line p-4"
    >
      {formError && <Alert tone="danger">{formError}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label="Tier name"
          placeholder="Gold"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Price (₹)"
          inputMode="decimal"
          hint="Enter 0 for free tickets."
          error={errors.price?.message}
          {...register('price')}
        />
        {generalAdmission && (
          <TextField
            label="Tickets available"
            inputMode="numeric"
            error={errors.capacity?.message}
            {...register('capacity')}
          />
        )}
        <TextField
          label="Most per order"
          inputMode="numeric"
          error={errors.maxPerOrder?.message}
          {...register('maxPerOrder')}
        />
      </div>
      <TextField
        label="Description"
        hint="Optional. For example: Rows A to C, closest to the stage."
        error={errors.description?.message}
        {...register('description')}
      />
      <div className="flex gap-3">
        <Button type="submit" pending={save.isPending}>
          {tier ? 'Save tier' : 'Add tier'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function TierRow({ event, tier }: { event: ManagedEvent; tier: TierView }) {
  const [editing, setEditing] = useState(false);
  const remove = useEventMutation(event.id, () => manageApi.deleteTier(event.id, tier.id));
  const locked = event.status === 'CANCELLED';

  if (editing)
    return (
      <TierForm
        event={event}
        tier={tier}
        onDone={() => {
          setEditing(false);
        }}
      />
    );

  return (
    <li className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col">
        <span className="font-medium">
          {tier.name} · {formatPrice(tier.priceInPaise)}
        </span>
        <span className="text-sm text-ink-muted">
          {tier.capacity === null
            ? event.seatingType === 'RESERVED'
              ? 'No seats assigned yet'
              : 'No capacity set'
            : `${tier.capacity - tier.available} of ${tier.capacity} sold · up to ${tier.maxPerOrder} per order`}
        </span>
        {remove.isError && (
          <span className="text-sm text-danger">{errorMessage(remove.error)}</span>
        )}
      </div>
      {!locked && (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setEditing(true);
            }}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            pending={remove.isPending}
            onClick={() => {
              remove.mutate(undefined);
            }}
          >
            Delete
          </Button>
        </div>
      )}
    </li>
  );
}

export function TierEditor({ event }: { event: ManagedEvent }) {
  const [adding, setAdding] = useState(false);
  const locked = event.status === 'CANCELLED';

  return (
    <div className="flex flex-col gap-4">
      {event.tiers.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No tiers yet. Add at least one price level, such as Gold and Silver, or a single Entry
          tier.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {event.tiers.map((tier) => (
            <TierRow key={tier.id} event={event} tier={tier} />
          ))}
        </ul>
      )}
      {adding ? (
        <TierForm
          event={event}
          onDone={() => {
            setAdding(false);
          }}
        />
      ) : (
        !locked && (
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => {
              setAdding(true);
            }}
          >
            Add tier
          </Button>
        )
      )}
    </div>
  );
}
