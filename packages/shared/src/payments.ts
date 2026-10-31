import { z } from 'zod';

export const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1).max(100),
  razorpayPaymentId: z.string().min(1).max(100),
  razorpaySignature: z.string().regex(/^[0-9a-f]{64}$/, 'Invalid payment signature.'),
});

export type VerifyPaymentInput = z.input<typeof verifyPaymentSchema>;

export interface PaymentSessionView {
  orderId: string;
  keyId: string;
  razorpayOrderId: string;
  amountInPaise: number;
  currency: 'INR';
  description: string;
  prefill: { name: string; email: string };
}
