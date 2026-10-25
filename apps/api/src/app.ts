import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { Env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { httpLogger } from './middleware/http-logger';
import { healthRouter } from './modules/health/health.routes';

export interface AppDependencies {
  env: Env;
  logger: Logger;
}

export function createApp({ env, logger }: AppDependencies): Express {
  const app = express();

  app.use(httpLogger(logger));
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.use(healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
