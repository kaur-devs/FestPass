import { createPrismaClient } from '@festpass/db';
import { Worker } from 'bullmq';
import { parseEnv } from './config/env';
import {
  deliveringEmailSender,
  loadEnvOrExit,
  onShutdown,
  paymentGatewayFrom,
} from './config/runtime';
import {
  emailProcessor,
  maintenanceProcessor,
  type ProcessorDependencies,
  scheduleMaintenance,
  ticketsProcessor,
} from './jobs/processors';
import { createQueueConnection, createQueues, QueueName } from './jobs/queues';
import { createLogger } from './lib/logger';
import { createRedis } from './lib/redis';
import { SeatHoldStore } from './modules/holds/seat-hold.store';
import { OrdersRepository } from './modules/orders/orders.repository';
import { OrdersService } from './modules/orders/orders.service';
import { PaymentsRepository } from './modules/payments/payments.repository';
import { PaymentsService } from './modules/payments/payments.service';
import { createRealtimePublisher } from './modules/realtime/create-publisher';
import { TicketCodes } from './modules/tickets/ticket-codes';
import { TicketDocuments } from './modules/tickets/ticket-documents';

const SHUTDOWN_TIMEOUT_MS = 30_000;

const env = loadEnvOrExit(() => parseEnv(process.env));
const logger = createLogger(env).child({ process: 'worker' });
const db = createPrismaClient(env.DATABASE_URL);
const redis = createRedis(env.REDIS_URL);
const connection = createQueueConnection(env.REDIS_URL);
const queues = createQueues(connection);

const ticketCodes = new TicketCodes(env.TICKET_SIGNING_SECRET);
const orders = new OrdersService(
  new OrdersRepository(db),
  new SeatHoldStore(redis),
  ticketCodes,
  logger,
  { publisher: createRealtimePublisher(db, redis, logger) },
);
const dependencies: ProcessorDependencies = {
  emailSender: deliveringEmailSender(env, logger),
  tickets: new TicketDocuments(db, ticketCodes, env.WEB_ORIGIN),
  orders,
  payments: new PaymentsService(
    new PaymentsRepository(db),
    orders,
    paymentGatewayFrom(env),
    logger,
  ),
};

const workers = [
  new Worker(QueueName.Email, emailProcessor(dependencies), { connection, concurrency: 5 }),
  new Worker(QueueName.Tickets, ticketsProcessor(dependencies), { connection, concurrency: 2 }),
  new Worker(QueueName.Maintenance, maintenanceProcessor(dependencies), {
    connection,
    concurrency: 1,
  }),
];

for (const worker of workers) {
  worker.on('failed', (job, error) => {
    logger.error(
      { err: error, queue: worker.name, jobId: job?.id, attempts: job?.attemptsMade },
      'Job failed',
    );
  });
  worker.on('error', (error) => {
    logger.error({ err: error, queue: worker.name }, 'Worker error');
  });
}

await scheduleMaintenance(queues.maintenance);
logger.info({ queues: workers.map((worker) => worker.name) }, 'Worker started');

onShutdown(logger, SHUTDOWN_TIMEOUT_MS, async () => {
  await Promise.all(workers.map((worker) => worker.close()));
  await Promise.allSettled([queues.close(), db.$disconnect()]);
  await Promise.allSettled([redis.quit(), connection.quit()]);
});
