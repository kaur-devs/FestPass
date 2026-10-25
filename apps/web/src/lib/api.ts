import { apiErrorResponseSchema, ErrorCode } from '@festpass/shared';
import { z } from 'zod';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const fieldErrorsSchema = z.object({
  fieldErrors: z.record(z.string(), z.array(z.string()).optional()),
});

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors: Partial<Record<string, string[]>> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null);
  const parsed = apiErrorResponseSchema.safeParse(body);
  if (!parsed.success) {
    return new ApiError(res.status, ErrorCode.Internal, 'Something went wrong. Please try again.');
  }
  const { code, message, details } = parsed.data.error;
  const fields = fieldErrorsSchema.safeParse(details);
  return new ApiError(res.status, code, message, fields.success ? fields.data.fieldErrors : {});
}

let refreshInFlight: Promise<boolean> | undefined;

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = undefined;
    });
  return refreshInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

async function send(path: string, { method = 'GET', body }: RequestOptions, canRefresh: boolean) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: 'include',
    ...(body !== undefined && {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });

  if (res.status === 401 && canRefresh && !path.startsWith('/auth/') && (await refreshSession())) {
    return send(path, { method, body }, false);
  }
  if (!res.ok) throw await toApiError(res);
  return res;
}

export async function apiJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await send(path, options, true);
  return (await res.json()) as T;
}

export async function apiCommand(path: string, options: RequestOptions = {}): Promise<void> {
  await send(path, { method: 'POST', ...options }, true);
}
