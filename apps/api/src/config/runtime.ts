import type { Logger } from 'pino';
import { type EmailSender, LogEmailSender, ResendEmailSender } from '../lib/email';
import { RazorpayGateway } from '../modules/payments/razorpay.gateway';
import type { Env } from './env';

export function loadEnvOrExit(parse: () => Env): Env {
  try {
    return parse();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

export function paymentGatewayFrom(env: Env): RazorpayGateway | undefined {
  return env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET
    ? new RazorpayGateway(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET, env.RAZORPAY_WEBHOOK_SECRET)
    : undefined;
}

export function deliveringEmailSender(env: Env, logger: Logger): EmailSender {
  return env.RESEND_API_KEY && env.EMAIL_FROM
    ? new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM)
    : new LogEmailSender(logger);
}

export function onShutdown(logger: Logger, timeoutMs: number, close: () => Promise<unknown>) {
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    setTimeout(() => {
      logger.error('Shutdown timed out, forcing exit');
      process.exit(1);
    }, timeoutMs).unref();
    close().then(
      () => process.exit(0),
      (error: unknown) => {
        logger.error({ err: error }, 'Error during shutdown');
        process.exit(1);
      },
    );
  };

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
}
