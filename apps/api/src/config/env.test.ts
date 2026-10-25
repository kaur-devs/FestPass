import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const required = {
  API_ORIGIN: 'http://localhost:4000',
  WEB_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://festpass:festpass@localhost:5433/festpass',
  JWT_SECRET: 'x'.repeat(32),
};

describe('parseEnv', () => {
  it('applies defaults and coerces numbers', () => {
    const env = parseEnv({ ...required, PORT: '5000' });

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 5000,
      LOG_LEVEL: 'info',
      TRUST_PROXY: 0,
    });
  });

  it('names every invalid variable in the error', () => {
    expect(() => parseEnv({ PORT: 'abc' })).toThrow(/PORT[\s\S]*WEB_ORIGIN|WEB_ORIGIN[\s\S]*PORT/);
  });

  it('rejects a short JWT secret', () => {
    expect(() => parseEnv({ ...required, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('treats empty optional values as unset', () => {
    const env = parseEnv({ ...required, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' });

    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined();
  });

  it('requires Google credentials as a pair', () => {
    expect(() => parseEnv({ ...required, GOOGLE_CLIENT_ID: 'id' })).toThrow(/GOOGLE_CLIENT_SECRET/);
  });
});
