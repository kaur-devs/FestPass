import { pino } from 'pino';
import type { Response } from 'supertest';
import { createApp } from '../app';
import type { Env } from '../config/env';
import type { EmailMessage, EmailSender } from '../lib/email';
import { type AuthRateLimits, DEFAULT_AUTH_RATE_LIMITS } from '../modules/auth/auth.routes';
import type { GoogleAuthProvider, GoogleProfile } from '../modules/auth/google';
import { db, TEST_DATABASE_URL } from './database';

export const WEB_ORIGIN = 'http://localhost:3000';

export const testEnv: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  LOG_LEVEL: 'silent',
  TRUST_PROXY: 0,
  API_ORIGIN: 'http://localhost:4000',
  WEB_ORIGIN,
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_SECRET: 'test-secret-that-is-at-least-32-characters',
  COOKIE_DOMAIN: undefined,
  GOOGLE_CLIENT_ID: undefined,
  GOOGLE_CLIENT_SECRET: undefined,
};

export class InMemoryEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  lastTokenFor(to: string, path: string): string {
    const message = this.sent.findLast((email) => email.to === to && email.text.includes(path));
    const url = message?.text.split(/\s+/).find((word) => word.startsWith(`${WEB_ORIGIN}${path}`));
    const token = url ? new URL(url).searchParams.get('token') : null;
    if (!token) throw new Error(`No email with a ${path} link was sent to ${to}`);
    return token;
  }
}

export class FakeGoogleAuthProvider implements GoogleAuthProvider {
  profile: GoogleProfile = {
    id: 'google-user-1',
    email: 'ananya@festpass.test',
    emailVerified: true,
    name: 'Ananya Gupta',
  };

  authorizationUrl(state: string, codeVerifier: string): URL {
    const url = new URL('https://accounts.google.test/o/oauth2/auth');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge_source', codeVerifier);
    return url;
  }

  exchangeCode(code: string): Promise<GoogleProfile> {
    if (code !== 'valid-code') return Promise.reject(new Error('invalid_grant'));
    return Promise.resolve(this.profile);
  }
}

export function createTestContext(options: { authRateLimits?: Partial<AuthRateLimits> } = {}) {
  const emails = new InMemoryEmailSender();
  const google = new FakeGoogleAuthProvider();
  const app = createApp({
    env: testEnv,
    logger: pino({ level: 'silent' }),
    db,
    emailSender: emails,
    google,
    authRateLimits: { ...DEFAULT_AUTH_RATE_LIMITS, ...options.authRateLimits },
  });
  return { app, db, emails, google };
}

export function getCookie(res: Response, name: string): string | undefined {
  const header = res.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  const value = match?.slice(name.length + 1).split(';')[0];
  return value === '' ? undefined : value;
}
