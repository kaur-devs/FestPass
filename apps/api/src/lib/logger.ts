import { pino, type Logger } from 'pino';
import type { Env } from '../config/env';

export function createLogger(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): Logger {
  return pino({
    level: env.LOG_LEVEL,
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    ...(env.NODE_ENV === 'development' && { transport: { target: 'pino-pretty' } }),
  });
}
