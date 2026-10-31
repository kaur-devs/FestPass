import { createPrismaClient } from '@festpass/db';
import { truncateAll } from '@festpass/db/testing';
import { resetRedis } from './redis';
import { TEST_DATABASE_URL } from './urls';

export const db = createPrismaClient(TEST_DATABASE_URL);

export async function resetDatabase() {
  await Promise.all([truncateAll(db), resetRedis()]);
}
