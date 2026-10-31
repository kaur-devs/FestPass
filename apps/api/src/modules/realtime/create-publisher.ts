import type { PrismaClient } from '@festpass/db';
import { Emitter } from '@socket.io/redis-emitter';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { SeatHoldStore } from '../holds/seat-hold.store';
import { EmitterPublisher } from './publisher';
import { SeatStatusReader } from './seat-status';

export function createRealtimePublisher(db: PrismaClient, redis: Redis, logger: Logger) {
  return new EmitterPublisher(
    new Emitter(redis),
    new SeatStatusReader(db, new SeatHoldStore(redis)),
    db,
    logger,
  );
}
