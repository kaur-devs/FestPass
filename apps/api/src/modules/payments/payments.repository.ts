import { getConstraintViolation, OrderStatus, type PrismaClient } from '@festpass/db';

const orderForPayment = {
  user: { select: { name: true, email: true } },
  event: { select: { title: true } },
} as const;

export class PaymentsRepository {
  constructor(private readonly db: PrismaClient) {}

  findOrder(orderId: string) {
    return this.db.order.findUnique({ where: { id: orderId }, include: orderForPayment });
  }

  findByGatewayOrderId(razorpayOrderId: string) {
    return this.db.order.findUnique({ where: { razorpayOrderId } });
  }

  async attachGatewayOrder(orderId: string, razorpayOrderId: string): Promise<boolean> {
    const { count } = await this.db.order.updateMany({
      where: { id: orderId, razorpayOrderId: null },
      data: { razorpayOrderId },
    });
    return count === 1;
  }

  async hasWebhookEvent(id: string): Promise<boolean> {
    return (await this.db.paymentWebhookEvent.count({ where: { id } })) > 0;
  }

  async recordWebhookEvent(id: string, event: string): Promise<void> {
    try {
      await this.db.paymentWebhookEvent.create({ data: { id, event } });
    } catch (error) {
      if (getConstraintViolation(error)?.constraint !== 'payment_webhook_events_pkey') throw error;
    }
  }

  dueForReconciliation(now: Date) {
    return this.db.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        expiresAt: { lte: now },
        razorpayOrderId: { not: null },
      },
      take: 50,
    });
  }

  refundsDue() {
    return this.db.order.findMany({
      where: {
        status: OrderStatus.REFUND_PENDING,
        razorpayPaymentId: { not: null },
        razorpayRefundId: null,
      },
      orderBy: { updatedAt: 'asc' },
      take: 20,
    });
  }

  async markRefunded(orderId: string, razorpayRefundId: string): Promise<void> {
    await this.db.order.updateMany({
      where: { id: orderId, status: OrderStatus.REFUND_PENDING },
      data: { status: OrderStatus.REFUNDED, razorpayRefundId, refundedAt: new Date() },
    });
  }
}
