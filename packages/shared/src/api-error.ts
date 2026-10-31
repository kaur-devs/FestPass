import { z } from 'zod';

export const ErrorCode = {
  ValidationFailed: 'VALIDATION_FAILED',
  InvalidJson: 'INVALID_JSON',
  PayloadTooLarge: 'PAYLOAD_TOO_LARGE',
  Unauthenticated: 'UNAUTHENTICATED',
  InvalidCredentials: 'INVALID_CREDENTIALS',
  InvalidToken: 'INVALID_TOKEN',
  EmailTaken: 'EMAIL_TAKEN',
  Forbidden: 'FORBIDDEN',
  OriginNotAllowed: 'ORIGIN_NOT_ALLOWED',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  SlugTaken: 'SLUG_TAKEN',
  EventNotReady: 'EVENT_NOT_READY',
  EventCancelled: 'EVENT_CANCELLED',
  SeatingTypeMismatch: 'SEATING_TYPE_MISMATCH',
  TierNameTaken: 'TIER_NAME_TAKEN',
  TierHasSales: 'TIER_HAS_SALES',
  TierInSeatMap: 'TIER_IN_SEAT_MAP',
  CapacityBelowSold: 'CAPACITY_BELOW_SOLD',
  SeatMapLocked: 'SEAT_MAP_LOCKED',
  SalesClosed: 'SALES_CLOSED',
  SeatsUnavailable: 'SEATS_UNAVAILABLE',
  HoldExpired: 'HOLD_EXPIRED',
  CheckoutInProgress: 'CHECKOUT_IN_PROGRESS',
  TierSoldOut: 'TIER_SOLD_OUT',
  OrderLimitExceeded: 'ORDER_LIMIT_EXCEEDED',
  OrderNotCancellable: 'ORDER_NOT_CANCELLABLE',
  OrderNotPayable: 'ORDER_NOT_PAYABLE',
  PaymentsUnavailable: 'PAYMENTS_UNAVAILABLE',
  PaymentVerificationFailed: 'PAYMENT_VERIFICATION_FAILED',
  InvalidWebhook: 'INVALID_WEBHOOK',
  RateLimited: 'RATE_LIMITED',
  Internal: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
