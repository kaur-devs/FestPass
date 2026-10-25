import { type ApiErrorResponse, ErrorCode } from '@festpass/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, NotFoundError } from '../lib/errors';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} does not exist.`));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const requestId = typeof req.id === 'string' ? req.id : undefined;
  const send = (status: number, error: Omit<ApiErrorResponse['error'], 'requestId'>) => {
    res.status(status).json({ error: { ...error, requestId } });
  };

  if (err instanceof AppError) {
    send(err.statusCode, { code: err.code, message: err.message, details: err.details });
    return;
  }

  switch (bodyParserErrorType(err)) {
    case 'entity.parse.failed':
      send(400, { code: ErrorCode.InvalidJson, message: 'The request body is not valid JSON.' });
      return;
    case 'entity.too.large':
      send(413, { code: ErrorCode.PayloadTooLarge, message: 'The request body is too large.' });
      return;
  }

  req.log.error({ err }, 'Unhandled error');
  send(500, { code: ErrorCode.Internal, message: 'Something went wrong. Please try again.' });
};

function bodyParserErrorType(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'type' in err && typeof err.type === 'string') {
    return err.type;
  }
  return undefined;
}
