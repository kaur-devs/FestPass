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

export interface SchemaIssue {
  path: readonly PropertyKey[];
  message: string;
}

export function applySchemaIssues<T extends FieldValues>(
  issues: readonly SchemaIssue[],
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string | undefined {
  let unmatched: string | undefined;
  for (const issue of issues) {
    const field = fields.find((name) => name === issue.path.map(String).join('.'));
    if (field) setError(field, { type: 'validate', message: issue.message });
    else unmatched ??= issue.message;
  }
  return unmatched;
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : FALLBACK_MESSAGE;
}
