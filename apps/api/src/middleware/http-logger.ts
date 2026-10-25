import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

const REQUEST_ID_HEADER = 'x-request-id';
const VALID_REQUEST_ID = /^[\w-]{1,128}$/;

export function httpLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId(req, res) {
      const incoming = req.headers[REQUEST_ID_HEADER];
      const id =
        typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
      res.setHeader(REQUEST_ID_HEADER, id);
      return id;
    },
    customLogLevel(_req, res, err) {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    autoLogging: { ignore: (req) => req.url === '/health' },
    serializers: {
      req: (req: { id: unknown; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  });
}
