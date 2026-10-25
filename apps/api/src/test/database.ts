import { createPrismaClient } from '@festpass/db';
import { testDatabaseUrl, truncateAll } from '@festpass/db/testing';

export const TEST_DATABASE_URL = testDatabaseUrl('festpass_api_test');

export const db = createPrismaClient(TEST_DATABASE_URL);

export const resetDatabase = () => truncateAll(db);
