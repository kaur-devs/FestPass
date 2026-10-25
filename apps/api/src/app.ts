import type { PrismaClient } from '@festpass/db';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { Env } from './config/env';
import type { EmailSender } from './lib/email';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { httpLogger } from './middleware/http-logger';
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
import type { GoogleAuthProvider } from './modules/auth/google';
import { createHealthRouter } from './modules/health/health.routes';
import { createUserRouter } from './modules/users/user.routes';
import { UserService } from './modules/users/user.service';

export interface AppDependencies {
  env: Env;
  logger: Logger;
  db: PrismaClient;
  emailSender: EmailSender;
  google?: GoogleAuthProvider | undefined;
  authRateLimits?: AuthRateLimits;
}

export function createApp({
  env,
  logger,
  db,
  emailSender,
  google,
  authRateLimits = DEFAULT_AUTH_RATE_LIMITS,
}: AppDependencies): Express {
  const cookies = { secure: env.NODE_ENV === 'production', domain: env.COOKIE_DOMAIN };
  const accessTokens = new AccessTokenService(env.JWT_SECRET);
  const authenticate = requireAuth(accessTokens);

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

  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(httpLogger(logger));
  app.use(helmet());
  app.use(cors({ origin: new URL(env.WEB_ORIGIN).origin, credentials: true }));
  app.use(verifyOrigin(env.WEB_ORIGIN));
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));

  app.use(createHealthRouter(db));
  app.use(createAuthRouter(authController, authenticate, authRateLimits));
  app.use(createUserRouter(users, authenticate));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
