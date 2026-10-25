import { z } from 'zod';

export const ErrorCode = {
  ValidationFailed: 'VALIDATION_FAILED',
  InvalidJson: 'INVALID_JSON',
  PayloadTooLarge: 'PAYLOAD_TOO_LARGE',
  Unauthenticated: 'UNAUTHENTICATED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  RateLimited: 'RATE_LIMITED',
  Internal: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
