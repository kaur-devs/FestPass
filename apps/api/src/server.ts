import { createApp } from './app';
import { type Env, parseEnv } from './config/env';
import { createLogger } from './lib/logger';

const SHUTDOWN_TIMEOUT_MS = 10_000;

let env: Env;
try {
  env = parseEnv(process.env);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

const logger = createLogger(env);
const app = createApp({ env, logger });

const server = app.listen(env.PORT, (error) => {
  if (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
  logger.info({ port: env.PORT }, 'API listening');
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');

  setTimeout(() => {
    logger.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'Error while closing server');
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  process.exit(1);
});
