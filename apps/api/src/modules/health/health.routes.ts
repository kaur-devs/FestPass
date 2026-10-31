import type { PrismaClient } from '@festpass/db';
import { Router } from 'express';
import type { Redis } from 'ioredis';

export function createHealthRouter(db: PrismaClient, redis: Redis): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/health/ready', async (req, res) => {
    try {
      await Promise.all([db.$queryRaw`SELECT 1`, redis.ping()]);
      res.json({ status: 'ok' });
    } catch (error) {
      req.log.error({ err: error }, 'Readiness check failed');
      res.status(503).json({ status: 'unavailable' });
    }
  });

  return router;
}
