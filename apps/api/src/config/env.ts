import { z } from 'zod';

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(0).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    API_ORIGIN: z.url(),
    WEB_ORIGIN: z.url(),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    JWT_SECRET: z.string().min(32, 'Must be at least 32 characters'),
    TICKET_SIGNING_SECRET: z.string().min(32, 'Must be at least 32 characters'),
    COOKIE_DOMAIN: optionalString,
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    RESEND_API_KEY: optionalString,
    EMAIL_FROM: optionalString,
    RAZORPAY_KEY_ID: optionalString,
    RAZORPAY_KEY_SECRET: optionalString,
    RAZORPAY_WEBHOOK_SECRET: optionalString,
  })
  .refine((env) => Boolean(env.GOOGLE_CLIENT_ID) === Boolean(env.GOOGLE_CLIENT_SECRET), {
    message: 'Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither',
    path: ['GOOGLE_CLIENT_SECRET'],
  })
  .refine((env) => !env.RESEND_API_KEY || Boolean(env.EMAIL_FROM), {
    message: 'Set EMAIL_FROM when RESEND_API_KEY is set',
    path: ['EMAIL_FROM'],
  })
  .refine(
    (env) =>
      new Set([
        Boolean(env.RAZORPAY_KEY_ID),
        Boolean(env.RAZORPAY_KEY_SECRET),
        Boolean(env.RAZORPAY_WEBHOOK_SECRET),
      ]).size === 1,
    {
      message:
        'Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET together, or none',
      path: ['RAZORPAY_KEY_ID'],
    },
  );

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
