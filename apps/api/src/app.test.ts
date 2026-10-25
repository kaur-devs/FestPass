import { apiErrorResponseSchema, ErrorCode } from '@festpass/shared';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

const WEB_ORIGIN = 'http://localhost:3000';

const app = createApp({
  env: { NODE_ENV: 'test', PORT: 0, LOG_LEVEL: 'silent', WEB_ORIGIN },
  logger: pino({ level: 'silent' }),
});

describe('GET /health', () => {
  it('reports the service is up', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('error responses', () => {
  it('returns a structured 404 for unknown routes', async () => {
    const res = await request(app).get('/does-not-exist');

    expect(res.status).toBe(404);
    const body = apiErrorResponseSchema.parse(res.body);
    expect(body.error.code).toBe(ErrorCode.NotFound);
    expect(body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(400);
    expect(apiErrorResponseSchema.parse(res.body).error.code).toBe(ErrorCode.InvalidJson);
  });

  it('rejects oversized bodies with 413', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(200_000) }));

    expect(res.status).toBe(413);
    expect(apiErrorResponseSchema.parse(res.body).error.code).toBe(ErrorCode.PayloadTooLarge);
  });
});

describe('request IDs', () => {
  it('reuses a valid incoming request ID', async () => {
    const res = await request(app).get('/health').set('X-Request-Id', 'trace-123');

    expect(res.headers['x-request-id']).toBe('trace-123');
  });

  it('replaces an unsafe incoming request ID', async () => {
    const res = await request(app).get('/health').set('X-Request-Id', 'spoofed id; level=fatal');

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('CORS', () => {
  it('allows the web origin with credentials', async () => {
    const res = await request(app).get('/health').set('Origin', WEB_ORIGIN);

    expect(res.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});
