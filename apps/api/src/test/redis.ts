import { createRedis } from '../lib/redis';
import { TEST_REDIS_URL } from './urls';

export const redis = createRedis(TEST_REDIS_URL);

export async function resetRedis() {
  await redis.flushdb();
}
