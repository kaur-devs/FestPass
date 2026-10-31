import type { Request } from 'express';
import { z } from 'zod';
import { NotFoundError, ValidationError } from './errors';

export function parseBody<Schema extends z.ZodType>(
  schema: Schema,
  req: Request,
): z.output<Schema> {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) throw new ValidationError(z.flattenError(result.error));
  return result.data;
}

export function parseQuery<Schema extends z.ZodType>(
  schema: Schema,
  req: Request,
): z.output<Schema> {
  const result = schema.safeParse(req.query);
  if (!result.success) throw new ValidationError(z.flattenError(result.error));
  return result.data;
}

const uuidSchema = z.uuid();

export function parseIdParam(req: Request, name: string): string {
  const result = uuidSchema.safeParse(req.params[name]);
  if (!result.success) throw new NotFoundError();
  return result.data;
}

export function readParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value.length === 0) throw new NotFoundError();
  return value;
}
