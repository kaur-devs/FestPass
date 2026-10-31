'use client';

import {
  createEventSchema,
  type CreateEventInput,
  type EventSummary,
  updateEventSchema,
  type UpdateEventInput,
  utcToZonedLocal,
  zonedLocalToUtc,
} from '@festpass/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { TextField } from '@/components/ui/text-field';
import { applySchemaIssues, applyServerErrors } from '@/lib/forms';

const TIME_ZONES = [
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Europe/London', label: 'London' },
  { value: 'America/New_York', label: 'New York' },
  { value: 'UTC', label: 'UTC' },
];

const SEATING_OPTIONS = [
  { value: 'RESERVED', label: 'Reserved seating (seat map)' },
  { value: 'GENERAL_ADMISSION', label: 'General admission (no seat numbers)' },
];

const requiredTime = z.string().min(1, 'Choose a date and time.');

const formSchema = z.object({
  title: z.string(),
  description: z.string(),
  venue: z.string(),
  timezone: z.string(),
  startsAt: requiredTime,
  endsAt: requiredTime,
  salesStartAt: requiredTime,
  salesEndAt: requiredTime,
  seatingType: z.enum(['RESERVED', 'GENERAL_ADMISSION']),
  slug: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

const FIELDS = [
  'title',
  'description',
  'venue',
  'timezone',
  'startsAt',
  'endsAt',
  'salesStartAt',
  'salesEndAt',
  'seatingType',
  'slug',
] as const;

type EventDetailsFormProps =
  | {
      mode: 'create';
      onSubmit: (input: CreateEventInput) => Promise<void>;
    }
  | {
      mode: 'edit';
      event: EventSummary & { description: string };
      onSubmit: (input: UpdateEventInput) => Promise<void>;
    };

function defaults(props: EventDetailsFormProps): FormValues {
  if (props.mode === 'create') {
    return {
      title: '',
      description: '',
      venue: '',
      timezone: 'Asia/Kolkata',
      startsAt: '',
      endsAt: '',
      salesStartAt: '',
      salesEndAt: '',
      seatingType: 'RESERVED',
      slug: '',
    };
  }
  const { event } = props;
  const local = (instant: string) => utcToZonedLocal(instant, event.timezone);
  return {
    title: event.title,
    description: event.description,
    venue: event.venue,
    timezone: event.timezone,
    startsAt: local(event.startsAt),
    endsAt: local(event.endsAt),
    salesStartAt: local(event.salesStartAt),
    salesEndAt: local(event.salesEndAt),
    seatingType: event.seatingType,
    slug: event.slug,
  };
}

export function EventDetailsForm(props: EventDetailsFormProps) {
  const [formError, setFormError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const isDraft = props.mode === 'create' || props.event.status === 'DRAFT';
  const readOnly = props.mode === 'edit' && props.event.status === 'CANCELLED';
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(formSchema), defaultValues: defaults(props) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    setSaved(false);
    const utc = (local: string) => zonedLocalToUtc(local, values.timezone).toISOString();
    const details = {
      title: values.title,
      description: values.description,
      venue: values.venue,
      timezone: values.timezone,
      startsAt: utc(values.startsAt),
      endsAt: utc(values.endsAt),
      salesStartAt: utc(values.salesStartAt),
      salesEndAt: utc(values.salesEndAt),
    };

    try {
      if (props.mode === 'create') {
        const input = { ...details, seatingType: values.seatingType };
        const parsed = createEventSchema.safeParse(input);
        if (!parsed.success) {
          setFormError(applySchemaIssues(parsed.error.issues, setError, FIELDS));
          return;
        }
        await props.onSubmit(input);
      } else {
        const input = { ...details, ...(isDraft && { slug: values.slug }) };
        const parsed = updateEventSchema.safeParse(input);
        if (!parsed.success) {
          setFormError(applySchemaIssues(parsed.error.issues, setError, FIELDS));
          return;
        }
        await props.onSubmit(input);
        setSaved(true);
      }
    } catch (error) {
      setFormError(applyServerErrors(error, setError, FIELDS));
    }
  });

  return (
    <form
      onSubmit={(event) => {
        void onSubmit(event);
      }}
      noValidate
      className="flex flex-col gap-4"
    >
      {formError && <Alert tone="danger">{formError}</Alert>}
      {saved && <Alert tone="success">Changes saved.</Alert>}
      <fieldset disabled={readOnly} className="flex flex-col gap-4">
        <TextField label="Event name" error={errors.title?.message} {...register('title')} />
        <TextareaField
          label="Description"
          hint="Shown on the event page. Line breaks are kept."
          error={errors.description?.message}
          {...register('description')}
        />
        <TextField label="Venue" error={errors.venue?.message} {...register('venue')} />
        <SelectField
          label="Time zone"
          options={TIME_ZONES}
          error={errors.timezone?.message}
          {...register('timezone')}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            label="Starts"
            type="datetime-local"
            error={errors.startsAt?.message}
            {...register('startsAt')}
          />
          <TextField
            label="Ends"
            type="datetime-local"
            error={errors.endsAt?.message}
            {...register('endsAt')}
          />
          <TextField
            label="Sales open"
            type="datetime-local"
            error={errors.salesStartAt?.message}
            {...register('salesStartAt')}
          />
          <TextField
            label="Sales close"
            type="datetime-local"
            error={errors.salesEndAt?.message}
            {...register('salesEndAt')}
          />
        </div>
        {props.mode === 'create' ? (
          <SelectField
            label="Seating"
            options={SEATING_OPTIONS}
            error={errors.seatingType?.message}
            {...register('seatingType')}
          />
        ) : (
          <TextField
            label="Event link"
            hint={
              isDraft
                ? 'Used in the event URL. It cannot change after publishing.'
                : 'Locked after publishing, because people may have shared it.'
            }
            disabled={!isDraft}
            error={errors.slug?.message}
            {...register('slug')}
          />
        )}
        <Button type="submit" pending={isSubmitting} className="self-start">
          {props.mode === 'create' ? 'Create draft' : 'Save details'}
        </Button>
      </fieldset>
    </form>
  );
}
