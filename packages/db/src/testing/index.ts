import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { PrismaClient } from '../generated/prisma/client';

const DEFAULT_SERVER_URL = 'postgresql://festpass:festpass@localhost:5433/postgres';
const PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url));

export function testDatabaseUrl(databaseName: string): string {
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Test database names must end in "_test", got "${databaseName}"`);
  }
  const url = new URL(process.env.TEST_DATABASE_SERVER_URL ?? DEFAULT_SERVER_URL);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function withClient(connectionString: string, run: (client: pg.Client) => Promise<void>) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await run(client);
  } finally {
    await client.end();
  }
}

export async function prepareTestDatabase(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const databaseName = url.pathname.slice(1);
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to reset a non-test database: ${databaseName}`);
  }

  const serverUrl = new URL(databaseUrl);
  serverUrl.pathname = '/postgres';
  await withClient(serverUrl.toString(), async (client) => {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      databaseName,
    ]);
    if (rowCount === 0) await client.query(`CREATE DATABASE "${databaseName}"`);
  });

  await withClient(databaseUrl, async (client) => {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  });

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: PACKAGE_DIR,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}

export async function truncateAll(db: PrismaClient): Promise<void> {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  const list = tables.map(({ tablename }) => `"${tablename}"`).join(', ');
  await db.$executeRawUnsafe(`TRUNCATE ${list} CASCADE`);
}
