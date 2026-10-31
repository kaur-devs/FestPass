'use client';

import { ErrorCode, formatPrice, type OrderView } from '@festpass/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Script from 'next/script';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/forms';
import { bookingApi, bookingKeys } from '@/lib/orders';

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
const BRAND_ACCENT = '#f59e0b';

export function PayButton({ order }: { order: OrderView }) {
  const queryClient = useQueryClient();
  const [scriptReady, setScriptReady] = useState(false);
  const [notice, setNotice] = useState<string>();

  const verify = useMutation({
    mutationFn: (response: RazorpaySuccessResponse) =>
      bookingApi.verifyPayment(order.id, {
        razorpayOrderId: response.razorpay_order_id,
        razorpayPaymentId: response.razorpay_payment_id,
        razorpaySignature: response.razorpay_signature,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(bookingKeys.order(order.id), updated);
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.order(order.id) });
    },
  });

  const start = useMutation({
    mutationFn: () => bookingApi.startPayment(order.id),
    onSuccess: (session) => {
      if (!window.Razorpay) {
        setNotice('The payment window could not load. Check your connection and try again.');
        return;
      }
      const checkout = new window.Razorpay({
        key: session.keyId,
        amount: session.amountInPaise,
        currency: session.currency,
        name: 'FestPass',
        description: session.description,
        order_id: session.razorpayOrderId,
        prefill: session.prefill,
        theme: { color: BRAND_ACCENT },
        handler: (response) => {
          verify.mutate(response);
        },
        modal: {
          ondismiss: () => {
            setNotice(
              'Payment was not completed. Your tickets are still held until the timer ends.',
            );
          },
        },
      });
      checkout.on('payment.failed', (response) => {
        setNotice(`Payment failed: ${response.error.description} You can try again.`);
      });
      setNotice(undefined);
      checkout.open();
    },
  });

  const unavailable =
    start.error instanceof ApiError && start.error.code === ErrorCode.PaymentsUnavailable;

  return (
    <div className="flex flex-col gap-3">
      <Script
        src={CHECKOUT_SCRIPT}
        strategy="afterInteractive"
        onReady={() => {
          setScriptReady(true);
        }}
      />
      {notice && <Alert tone="danger">{notice}</Alert>}
      {start.isError && (
        <Alert tone="danger">
          {unavailable
            ? 'Online payment is not set up on this server yet.'
            : errorMessage(start.error)}
        </Alert>
      )}
      {verify.isError && <Alert tone="danger">{errorMessage(verify.error)}</Alert>}
      <Button
        disabled={!scriptReady || unavailable}
        pending={start.isPending || verify.isPending}
        onClick={() => {
          start.mutate();
        }}
      >
        {verify.isPending ? 'Confirming payment' : `Pay ${formatPrice(order.totalInPaise)}`}
      </Button>
      <p className="text-sm text-ink-muted">
        Secure payment by Razorpay: UPI, cards, net banking and wallets.
      </p>
    </div>
  );
}
