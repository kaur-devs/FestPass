import { afterAll } from 'vitest';
import { redis } from './redis';

afterAll(async () => {
  if (redis.status !== 'end') await redis.quit();
});
