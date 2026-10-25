import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api';

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string | undefined {
  if (!(error instanceof ApiError)) return FALLBACK_MESSAGE;

  let matchedField = false;
  for (const field of fields) {
    const message = error.fieldErrors[field]?.[0];
    if (message) {
      setError(field, { type: 'server', message });
      matchedField = true;
    }
  }
  return matchedField ? undefined : error.message;
}
