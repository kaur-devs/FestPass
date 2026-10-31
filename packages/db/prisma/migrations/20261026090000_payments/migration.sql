-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "razorpay_refund_id" TEXT,
ADD COLUMN     "refunded_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_razorpay_refund_id_key" ON "orders"("razorpay_refund_id");


ALTER TABLE "orders"
  ADD CONSTRAINT "orders_refund_check" CHECK ((status = 'REFUNDED') = (refunded_at IS NOT NULL));
