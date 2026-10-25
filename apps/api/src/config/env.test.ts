import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('applies defaults and coerces numbers', () => {
    const env = parseEnv({ WEB_ORIGIN: 'http://localhost:3000', PORT: '5000' });

    expect(env).toEqual({
      NODE_ENV: 'development',
      PORT: 5000,
      LOG_LEVEL: 'info',
      WEB_ORIGIN: 'http://localhost:3000',
    });
  });

  it('names every invalid variable in the error', () => {
    expect(() => parseEnv({ PORT: 'abc' })).toThrow(/PORT[\s\S]*WEB_ORIGIN|WEB_ORIGIN[\s\S]*PORT/);
  });
});
