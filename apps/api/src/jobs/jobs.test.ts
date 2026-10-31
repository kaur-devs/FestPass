import { randomUUID } from 'node:crypto';
import { type Job, QueueEvents, Worker } from 'bullmq';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryEmailSender } from '../test/context';
import { resetRedis } from '../test/redis';
import { TEST_REDIS_URL } from '../test/urls';
import { emailProcessor, type ProcessorDependencies } from './processors';
import {
  createQueueConnection,
  createQueues,
  QueuedEmailSender,
  QueuedTicketDelivery,
  QueueName,
} from './queues';

const connection = createQueueConnection(TEST_REDIS_URL);
const queues = createQueues(connection);

beforeEach(resetRedis);

afterAll(async () => {
  await queues.close();
  await connection.quit();
});

describe('email queue', () => {
  it('delivers queued emails through the worker', async () => {
    const sender = new InMemoryEmailSender();
    const worker = new Worker(
      QueueName.Email,
      emailProcessor({ emailSender: sender } as unknown as ProcessorDependencies),
      { connection },
    );
    const events = new QueueEvents(QueueName.Email, {
      connection: createQueueConnection(TEST_REDIS_URL),
    });
    await events.waitUntilReady();

    try {
      await new QueuedEmailSender(queues.email).send({
        to: 'riya@festpass.test',
        subject: 'Confirm your email for FestPass',
        text: 'Hello',
      });
      const [job] = (await queues.email.getJobs(['waiting', 'active', 'completed'])) as Job[];
      await job?.waitUntilFinished(events, 10_000);

      expect(sender.sent).toEqual([
        { to: 'riya@festpass.test', subject: 'Confirm your email for FestPass', text: 'Hello' },
      ]);
    } finally {
      await worker.close();
      await events.close();
    }
  });

  it('refuses attachments, which must be rendered in the worker', async () => {
    await expect(
      new QueuedEmailSender(queues.email).send({
        to: 'riya@festpass.test',
        subject: 'Tickets',
        text: 'See attached',
        attachments: [{ filename: 'tickets.pdf', content: Buffer.from('%PDF-') }],
      }),
    ).rejects.toThrow(/attachments/);
  });
});

describe('ticket delivery queue', () => {
  it('queues one delivery per order, however often it is requested', async () => {
    const delivery = new QueuedTicketDelivery(queues.tickets);
    const orderId = randomUUID();

    await Promise.all([delivery.ticketsIssued(orderId), delivery.ticketsIssued(orderId)]);
    await delivery.ticketsIssued(orderId);

    const jobs = await queues.tickets.getJobs(['waiting', 'delayed', 'active']);
    expect(jobs.map((job) => job.data.orderId)).toEqual([orderId]);
  });
});
