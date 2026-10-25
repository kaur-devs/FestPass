import { createPrismaClient } from '../client';
import { testDatabaseUrl, truncateAll as truncate } from '../testing';

export const databaseUrl = testDatabaseUrl('festpass_test');

export const db = createPrismaClient(databaseUrl);

export const truncateAll = () => truncate(db);
