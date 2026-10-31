import { type JobsOptions, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { EmailMessage, EmailSender } from '../lib/email';

export const QueueName = {
  Email: 'email',
  Tickets: 'tickets',
  Maintenance: 'maintenance',
} as const;

export const MaintenanceJob = {
  ExpireCheckouts: 'expire-checkouts',
  ProcessRefunds: 'process-refunds',
} as const;

export interface EmailJob {
  to: string;
  subject: string;
  text: string;
}

export interface TicketsIssuedJob {
  orderId: string;
}

const RETRYING_JOB: JobsOptions = {
  attempts: 8,
  backoff: { type: 'exponential', delay: 15_000 },
  removeOnComplete: { age: 24 * 60 * 60 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
};

export function createQueueConnection(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

export interface Queues {
  email: Queue<EmailJob>;
  tickets: Queue<TicketsIssuedJob>;
  maintenance: Queue;
  close(): Promise<void>;
}

export function createQueues(connection: Redis): Queues {
  const email = new Queue<EmailJob>(QueueName.Email, {
    connection,
    defaultJobOptions: RETRYING_JOB,
  });
  const tickets = new Queue<TicketsIssuedJob>(QueueName.Tickets, {
    connection,
    defaultJobOptions: RETRYING_JOB,
  });
  const maintenance = new Queue(QueueName.Maintenance, {
    connection,
    defaultJobOptions: { removeOnComplete: true, removeOnFail: { count: 100 } },
  });
  return {
    email,
    tickets,
    maintenance,
    close: async () => {
      await Promise.all([email.close(), tickets.close(), maintenance.close()]);
    },
  };
}

export class QueuedEmailSender implements EmailSender {
  constructor(private readonly queue: Queue<EmailJob>) {}

  async send(message: EmailMessage): Promise<void> {
    if (message.attachments?.length) {
      throw new Error('Queued emails cannot carry attachments; render them in the worker instead');
    }
    await this.queue.add('send', { to: message.to, subject: message.subject, text: message.text });
  }
}

export interface TicketDelivery {
  ticketsIssued(orderId: string): Promise<void>;
}

export class QueuedTicketDelivery implements TicketDelivery {
  constructor(private readonly queue: Queue<TicketsIssuedJob>) {}

  async ticketsIssued(orderId: string): Promise<void> {
    await this.queue.add('deliver', { orderId }, { jobId: `tickets-issued-${orderId}` });
  }
}
