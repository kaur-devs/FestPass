import { OrderStatus, type PrismaClient, TicketStatus } from '@festpass/db';
import { formatEventDate, ticketReference } from '@festpass/shared';
import type { EmailSender } from '../../lib/email';
import { seatLabel } from '../orders/orders.mapper';
import type { TicketCodes } from './ticket-codes';
import { type PrintableTicket, renderTicketsPdf } from './ticket-pdf';

export type DeliveryOutcome = 'sent' | 'skipped';

export class TicketDocuments {
  constructor(
    private readonly db: PrismaClient,
    private readonly codes: TicketCodes,
    private readonly webOrigin: string,
  ) {}

  async renderOrderPdf(orderId: string): Promise<Buffer | null> {
    const order = await this.loadPaidOrder(orderId);
    return order && order.tickets.length > 0 ? renderTicketsPdf(this.printable(order)) : null;
  }

  async emailTickets(orderId: string, sender: EmailSender): Promise<DeliveryOutcome> {
    const order = await this.loadPaidOrder(orderId);
    if (!order || order.tickets.length === 0) return 'skipped';

    const when = formatEventDate(order.event.startsAt, order.event.timezone);
    const count = order.tickets.length;
    const pdf = await renderTicketsPdf(this.printable(order));

    await sender.send(
      {
        to: order.user.email,
        subject: `Your ${count === 1 ? 'ticket' : `${count} tickets`} for ${order.event.title}`,
        text: [
          `Hi ${order.user.name},`,
          `You're going to ${order.event.title}.`,
          `${when} · ${order.event.venue}`,
          ...order.tickets.map(
            (ticket) => `• ${ticket.tier.name}: ${seatLabel(ticket.seat) ?? 'General admission'}`,
          ),
          `Your tickets are attached. Show the QR code at the gate, on your phone or printed. You can also find them at ${this.webOrigin}/orders/${order.id}`,
          'Each QR code admits one person once, so do not share it.',
        ].join('\n\n'),
        attachments: [{ filename: `festpass-${order.event.slug}.pdf`, content: pdf }],
      },
      `tickets-${order.id}`,
    );
    return 'sent';
  }

  private loadPaidOrder(orderId: string) {
    return this.db.order.findFirst({
      where: { id: orderId, status: OrderStatus.PAID },
      include: {
        user: { select: { name: true, email: true } },
        event: true,
        tickets: {
          where: { status: TicketStatus.ACTIVE },
          include: { tier: { select: { name: true } }, seat: true },
          orderBy: { id: 'asc' },
        },
      },
    });
  }

  private printable(
    order: NonNullable<Awaited<ReturnType<TicketDocuments['loadPaidOrder']>>>,
  ): PrintableTicket[] {
    const when = formatEventDate(order.event.startsAt, order.event.timezone);
    return order.tickets.map((ticket) => ({
      code: this.codes.sign(ticket.id),
      reference: ticketReference(ticket.id),
      eventTitle: order.event.title,
      venue: order.event.venue,
      when,
      tierName: ticket.tier.name,
      seatLabel: seatLabel(ticket.seat),
      holderName: order.user.name,
    }));
  }
}
