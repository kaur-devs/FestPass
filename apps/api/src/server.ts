import { createPrismaClient } from '@festpass/db';
import { createApp } from './app';
import { parseEnv } from './config/env';
import { loadEnvOrExit, onShutdown, paymentGatewayFrom } from './config/runtime';
import {
  createQueueConnection,
  createQueues,
  QueuedEmailSender,
  QueuedTicketDelivery,
} from './jobs/queues';
import { createLogger } from './lib/logger';
import { createRedis } from './lib/redis';
import { ArcticGoogleAuthProvider } from './modules/auth/google';
import { createRealtimePublisher } from './modules/realtime/create-publisher';
import { attachRealtime } from './modules/realtime/socket-server';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const env = loadEnvOrExit(() => parseEnv(process.env));
const logger = createLogger(env);
const db = createPrismaClient(env.DATABASE_URL);
const redis = createRedis(env.REDIS_URL);
const queueConnection = createQueueConnection(env.REDIS_URL);
const queues = createQueues(queueConnection);

const google =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? new ArcticGoogleAuthProvider(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        new URL('/auth/google/callback', env.API_ORIGIN).toString(),
      )
    : undefined;
const paymentGateway = paymentGatewayFrom(env);

const app = createApp({
  env,
  logger,
  db,
  redis,
  emailSender: new QueuedEmailSender(queues.email),
  ticketDelivery: new QueuedTicketDelivery(queues.tickets),
  realtime: createRealtimePublisher(db, redis, logger),
  google,
  paymentGateway,
});

const server = app.listen(env.PORT, (error) => {
  if (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
  logger.info(
    { port: env.PORT, googleSignIn: Boolean(google), payments: Boolean(paymentGateway) },
    'API listening',
  );
});

const realtime = attachRealtime(server, {
  webOrigin: env.WEB_ORIGIN,
  jwtSecret: env.JWT_SECRET,
  db,
  redis,
  logger,
});

onShutdown(logger, SHUTDOWN_TIMEOUT_MS, async () => {
  await realtime.close();
  await Promise.allSettled([queues.close(), db.$disconnect()]);
  await Promise.allSettled([redis.quit(), queueConnection.quit()]);
});
