import { Prisma } from './generated/prisma/client';

const VIOLATION_KINDS = {
  '23505': 'unique',
  '23503': 'foreign_key',
  '23514': 'check',
} as const;

type PostgresCode = keyof typeof VIOLATION_KINDS;

export type ConstraintViolationKind = (typeof VIOLATION_KINDS)[PostgresCode];

export interface ConstraintViolation {
  kind: ConstraintViolationKind;
  constraint: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPostgresCode(code: unknown): code is PostgresCode {
  return typeof code === 'string' && code in VIOLATION_KINDS;
}

export function getConstraintViolation(error: unknown): ConstraintViolation | undefined {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return undefined;

  const adapterError = error.meta?.driverAdapterError;
  const cause = isRecord(adapterError) ? adapterError.cause : undefined;
  if (!isRecord(cause) || !isPostgresCode(cause.originalCode)) return undefined;

  const message = typeof cause.originalMessage === 'string' ? cause.originalMessage : '';
  const constraint = /constraint "([^"]+)"/.exec(message)?.[1];
  if (!constraint) return undefined;

  return { kind: VIOLATION_KINDS[cause.originalCode], constraint };
}
