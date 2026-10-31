import type { Job, Queue } from 'bullmq';
import type { EmailSender } from '../lib/email';
import type { OrdersService } from '../modules/orders/orders.service';
import type { PaymentsService } from '../modules/payments/payments.service';
import type { TicketDocuments } from '../modules/tickets/ticket-documents';
import { type EmailJob, MaintenanceJob, type TicketsIssuedJob } from './queues';

const EXPIRE_CHECKOUTS_EVERY_MS = 15_000;
const PROCESS_REFUNDS_EVERY_MS = 60_000;

export interface ProcessorDependencies {
  emailSender: EmailSender;
  tickets: TicketDocuments;
  orders: OrdersService;
  payments: PaymentsService;
}

export function emailProcessor({ emailSender }: ProcessorDependencies) {
  return async (job: Job<EmailJob>) => {
    await emailSender.send(job.data, `email-${job.id ?? job.name}`);
  };
}

export function ticketsProcessor({ tickets, emailSender }: ProcessorDependencies) {
  return (job: Job<TicketsIssuedJob>) => tickets.emailTickets(job.data.orderId, emailSender);
}

export function maintenanceProcessor({ orders, payments }: ProcessorDependencies) {
  return async (job: Job) => {
    switch (job.name) {
      case MaintenanceJob.ExpireCheckouts: {
        const confirmed = await payments.reconcileDue();
        const expired = await orders.expireDue();
        return { confirmed, expired };
      }
      case MaintenanceJob.ProcessRefunds:
        return { refunded: await payments.processRefunds() };
      default:
        throw new Error(`Unknown maintenance job "${job.name}"`);
    }
  };
}

export async function scheduleMaintenance(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(
    MaintenanceJob.ExpireCheckouts,
    { every: EXPIRE_CHECKOUTS_EVERY_MS },
    { name: MaintenanceJob.ExpireCheckouts },
  );
  await queue.upsertJobScheduler(
    MaintenanceJob.ProcessRefunds,
    { every: PROCESS_REFUNDS_EVERY_MS },
    { name: MaintenanceJob.ProcessRefunds },
  );
}
