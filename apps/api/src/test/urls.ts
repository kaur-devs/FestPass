import { testDatabaseUrl } from '@festpass/db/testing';

export const TEST_DATABASE_URL = testDatabaseUrl('festpass_api_test');

export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';

if (!/\/1[0-5]$/.test(TEST_REDIS_URL)) {
  throw new Error(`Refusing to run tests against Redis database outside 10-15: ${TEST_REDIS_URL}`);
}
