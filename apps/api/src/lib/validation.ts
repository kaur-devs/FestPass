import type { Request } from 'express';
import { z } from 'zod';
import { ValidationError } from './errors';

export function parseBody<Schema extends z.ZodType>(
  schema: Schema,
  req: Request,
): z.output<Schema> {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) throw new ValidationError(z.flattenError(result.error));
  return result.data;
}
