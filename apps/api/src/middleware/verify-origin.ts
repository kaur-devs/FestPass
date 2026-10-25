import { ErrorCode } from '@festpass/shared';
import type { RequestHandler } from 'express';
import { ForbiddenError } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function verifyOrigin(allowedOrigin: string): RequestHandler {
  const allowed = new URL(allowedOrigin).origin;

  return (req, _res, next) => {
    const origin = req.get('origin');
    if (SAFE_METHODS.has(req.method) || origin === undefined || origin === allowed) {
      next();
      return;
    }
    next(
      new ForbiddenError('Requests from this site are not allowed.', ErrorCode.OriginNotAllowed),
    );
  };
}
