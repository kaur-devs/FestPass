import { rateLimit } from 'express-rate-limit';
import { RateLimitedError } from '../lib/errors';

export interface RateLimitRule {
  windowMs: number;
  limit: number;
}

export function rateLimiter({ windowMs, limit }: RateLimitRule) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new RateLimitedError());
    },
  });
}
