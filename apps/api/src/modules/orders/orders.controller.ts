import { checkoutSchema, holdSeatsSchema } from '@festpass/shared';
import type { RequestHandler } from 'express';
import { parseBody, parseIdParam } from '../../lib/validation';
import { getAuth } from '../../middleware/require-auth';
import { ErrorCode } from '@festpass/shared';
import { ConflictError } from '../../lib/errors';
import type { HoldsService } from '../holds/holds.service';
import type { TicketDocuments } from '../tickets/ticket-documents';
import type { OrdersService } from './orders.service';

export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly holds: HoldsService,
    private readonly documents: TicketDocuments,
  ) {}

  getHold: RequestHandler = async (req, res) => {
    res.json(await this.holds.current(getAuth(req).userId, parseIdParam(req, 'eventId')));
  };

  putHold: RequestHandler = async (req, res) => {
    const { seatIds } = parseBody(holdSeatsSchema, req);
    const hold = await this.holds.hold(getAuth(req).userId, parseIdParam(req, 'eventId'), seatIds);
    res.json({ hold });
  };

  checkout: RequestHandler = async (req, res) => {
    const order = await this.orders.checkout(getAuth(req).userId, parseBody(checkoutSchema, req));
    res.status(201).json({ order });
  };

  get: RequestHandler = async (req, res) => {
    res.json({ order: await this.orders.get(getAuth(req).userId, parseIdParam(req, 'orderId')) });
  };

  cancel: RequestHandler = async (req, res) => {
    res.json({
      order: await this.orders.cancel(getAuth(req).userId, parseIdParam(req, 'orderId')),
    });
  };

  ticketsPdf: RequestHandler = async (req, res) => {
    const order = await this.orders.get(getAuth(req).userId, parseIdParam(req, 'orderId'));
    const pdf = order.status === 'PAID' ? await this.documents.renderOrderPdf(order.id) : null;
    if (!pdf) {
      throw new ConflictError(
        'Tickets are available once the order is paid.',
        ErrorCode.OrderNotPayable,
      );
    }
    res
      .type('application/pdf')
      .attachment(`festpass-${order.event.slug}.pdf`)
      .set('Cache-Control', 'private, no-store')
      .send(pdf);
  };
}
