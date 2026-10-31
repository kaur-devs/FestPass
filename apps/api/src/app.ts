import type { PrismaClient } from '@festpass/db';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import type { Redis } from 'ioredis';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { Env } from './config/env';
import type { EmailSender } from './lib/email';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { httpLogger } from './middleware/http-logger';
import { redisRateLimiters } from './middleware/rate-limit';
import { requireAuth } from './middleware/require-auth';
import { verifyOrigin } from './middleware/verify-origin';
import { AccessTokenService } from './modules/auth/access-tokens';
import { AuthController } from './modules/auth/auth.controller';
import { AuthEmails } from './modules/auth/auth.emails';
import { AuthRepository } from './modules/auth/auth.repository';
import {
  type AuthRateLimits,
  createAuthRouter,
  DEFAULT_AUTH_RATE_LIMITS,
} from './modules/auth/auth.routes';
import { AuthService } from './modules/auth/auth.service';
import { AuthorizationService } from './modules/auth/authorization';
import { CheckInController } from './modules/checkin/checkin.controller';
import { CheckInRepository } from './modules/checkin/checkin.repository';
import { createCheckInRouter } from './modules/checkin/checkin.routes';
import { CheckInService } from './modules/checkin/checkin.service';
import { VolunteersService } from './modules/checkin/volunteers.service';
import type { GoogleAuthProvider } from './modules/auth/google';
import { EventCatalogService } from './modules/events/event-catalog.service';
import { EventManagementService } from './modules/events/event-management.service';
import { EventsController } from './modules/events/events.controller';
import { EventsRepository } from './modules/events/events.repository';
import { createEventsRouter } from './modules/events/events.routes';
import { createHealthRouter } from './modules/health/health.routes';
import { HoldsService } from './modules/holds/holds.service';
import { SeatHoldStore } from './modules/holds/seat-hold.store';
import { OrdersController } from './modules/orders/orders.controller';
import { OrdersRepository } from './modules/orders/orders.repository';
import { createOrdersRouter } from './modules/orders/orders.routes';
import { OrdersService } from './modules/orders/orders.service';
import { PaymentsController } from './modules/payments/payments.controller';
import { PaymentsRepository } from './modules/payments/payments.repository';
import { createPaymentsRouter, createWebhookRouter } from './modules/payments/payments.routes';
import { PaymentsService } from './modules/payments/payments.service';
import type { PaymentGateway } from './modules/payments/razorpay.gateway';
import { TicketCodes } from './modules/tickets/ticket-codes';
import { TicketDocuments } from './modules/tickets/ticket-documents';
import type { TicketDelivery } from './jobs/queues';
import type { RealtimePublisher } from './modules/realtime/publisher';
import { SeatStatusReader } from './modules/realtime/seat-status';
import { createUserRouter } from './modules/users/user.routes';
import { UserService } from './modules/users/user.service';

export interface AppDependencies {
  env: Env;
  logger: Logger;
  db: PrismaClient;
  redis: Redis;
  emailSender: EmailSender;
  google?: GoogleAuthProvider | undefined;
  paymentGateway?: PaymentGateway | undefined;
  ticketDelivery?: TicketDelivery | undefined;
  realtime?: RealtimePublisher | undefined;
  authRateLimits?: AuthRateLimits;
}

export function createApp({
  env,
  logger,
  db,
  redis,
  emailSender,
  google,
  paymentGateway,
  ticketDelivery,
  realtime,
  authRateLimits = DEFAULT_AUTH_RATE_LIMITS,
}: AppDependencies): Express {
  const cookies = { secure: env.NODE_ENV === 'production', domain: env.COOKIE_DOMAIN };
  const accessTokens = new AccessTokenService(env.JWT_SECRET);
  const authenticate = requireAuth(accessTokens);
  const rateLimiter = redisRateLimiters(redis);
  const seatHolds = new SeatHoldStore(redis);
  const ticketCodes = new TicketCodes(env.TICKET_SIGNING_SECRET);

  const users = new UserService(db);
  const auth = new AuthService(
    new AuthRepository(db),
    accessTokens,
    new AuthEmails(emailSender, env.WEB_ORIGIN),
    logger,
  );
  const authController = new AuthController(
    auth,
    users,
    { cookies, webOrigin: env.WEB_ORIGIN },
    logger,
    google,
  );

  const authorization = new AuthorizationService(db);
  const eventsRepository = new EventsRepository(db);
  const eventCatalog = new EventCatalogService(
    eventsRepository,
    new SeatStatusReader(db, seatHolds),
  );
  const eventsController = new EventsController(
    eventCatalog,
    new EventManagementService(eventsRepository, authorization),
  );

  const ordersRepository = new OrdersRepository(db);
  const ordersService = new OrdersService(ordersRepository, seatHolds, ticketCodes, logger, {
    delivery: ticketDelivery,
    publisher: realtime,
  });
  const ordersController = new OrdersController(
    ordersService,
    new HoldsService(ordersRepository, seatHolds, realtime),
    new TicketDocuments(db, ticketCodes, env.WEB_ORIGIN),
  );
  const paymentsController = new PaymentsController(
    new PaymentsService(new PaymentsRepository(db), ordersService, paymentGateway, logger),
  );

  const checkInRepository = new CheckInRepository(db);
  const checkInController = new CheckInController(
    new CheckInService(checkInRepository, authorization, ticketCodes, realtime),
    new VolunteersService(checkInRepository, authorization),
  );

  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(httpLogger(logger));
  app.use(helmet());
  app.use(cors({ origin: new URL(env.WEB_ORIGIN).origin, credentials: true }));
  app.use(verifyOrigin(env.WEB_ORIGIN));
  app.use(cookieParser());
  app.use(createWebhookRouter(paymentsController));
  app.use(express.json({ limit: '100kb' }));

  app.use(createHealthRouter(db, redis));
  app.use(createAuthRouter(authController, authenticate, authRateLimits, rateLimiter));
  app.use(createUserRouter(users, authenticate));
  app.use(createEventsRouter(eventsController, authenticate));
  app.use(createOrdersRouter(ordersController, authenticate, rateLimiter));
  app.use(createPaymentsRouter(paymentsController, authenticate, rateLimiter));
  app.use(createCheckInRouter(checkInController, authenticate, rateLimiter));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
