import { rateLimit } from 'express-rate-limit';
import type { Redis } from 'ioredis';
import { type RedisReply, RedisStore } from 'rate-limit-redis';
import { RateLimitedError } from '../lib/errors';

export interface RateLimitRule {
  windowMs: number;
  limit: number;
}

export type RateLimiterFactory = (
  name: string,
  rule: RateLimitRule,
) => ReturnType<typeof rateLimit>;

export function redisRateLimiters(redis: Redis): RateLimiterFactory {
  return (name, { windowMs, limit }) =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      store: new RedisStore({
        prefix: `rate-limit:${name}:`,
        sendCommand: (command: string, ...args: string[]) =>
          redis.call(command, ...args) as Promise<RedisReply>,
      }),
      handler: (_req, _res, next) => {
        next(new RateLimitedError());
      },
    });
}
