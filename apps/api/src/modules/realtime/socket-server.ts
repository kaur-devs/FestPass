import type { Server as HttpServer } from 'node:http';
import type { PrismaClient } from '@festpass/db';
import { ErrorCode, type SubscribeAck, subscribeRequestSchema } from '@festpass/shared';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { Server } from 'socket.io';
import { ACCESS_TOKEN_COOKIE } from '../auth/auth.cookies';
import { type AccessTokenClaims, AccessTokenService } from '../auth/access-tokens';
import { AuthorizationService } from '../auth/authorization';
import { eventRoom, manageRoom } from './publisher';

const MAX_ROOMS_PER_SOCKET = 10;

interface SocketData {
  auth: AccessTokenClaims | undefined;
}

export interface RealtimeOptions {
  webOrigin: string;
  jwtSecret: string;
  db: PrismaClient;
  redis: Redis;
  logger: Logger;
}

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

export function attachRealtime(httpServer: HttpServer, options: RealtimeOptions) {
  const allowedOrigin = new URL(options.webOrigin).origin;
  const accessTokens = new AccessTokenService(options.jwtSecret);
  const authorization = new AuthorizationService(options.db);
  const pubClient = options.redis.duplicate();
  const subClient = options.redis.duplicate();

  const io = new Server<
    Record<string, never>,
    Record<string, never>,
    Record<string, never>,
    SocketData
  >(httpServer, {
    serveClient: false,
    cors: { origin: allowedOrigin, credentials: true },
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, origin === undefined || origin === allowedOrigin);
    },
  });
  io.adapter(createAdapter(pubClient, subClient));

  io.use((socket, next) => {
    const token = readCookie(socket.handshake.headers.cookie, ACCESS_TOKEN_COOKIE);
    if (!token) {
      socket.data.auth = undefined;
      next();
      return;
    }
    accessTokens.verify(token).then(
      (claims) => {
        socket.data.auth = claims;
        next();
      },
      (error: unknown) => {
        next(error instanceof Error ? error : new Error('Authentication failed'));
      },
    );
  });

  io.on('connection', (socket) => {
    socket.on('subscribe', (payload: unknown, ack?: (response: SubscribeAck) => void) => {
      const reply = (response: SubscribeAck) => {
        if (typeof ack === 'function') ack(response);
      };
      const parsed = subscribeRequestSchema.safeParse(payload);
      if (!parsed.success) {
        reply({ ok: false, code: ErrorCode.ValidationFailed, message: 'Invalid subscription.' });
        return;
      }
      if (socket.rooms.size > MAX_ROOMS_PER_SOCKET) {
        reply({ ok: false, code: ErrorCode.RateLimited, message: 'Too many subscriptions.' });
        return;
      }

      const { channel, eventId } = parsed.data;
      if (channel === 'event') {
        void socket.join(eventRoom(eventId));
        reply({ ok: true });
        return;
      }

      const auth = socket.data.auth;
      if (!auth) {
        reply({
          ok: false,
          code: ErrorCode.Unauthenticated,
          message: 'Sign in to see live sales.',
        });
        return;
      }
      authorization.requireEventManager(auth.userId, eventId).then(
        () => {
          void socket.join(manageRoom(eventId));
          reply({ ok: true });
        },
        () => {
          reply({ ok: false, code: ErrorCode.Forbidden, message: 'You do not manage this event.' });
        },
      );
    });

    socket.on('unsubscribe', (payload: unknown) => {
      const parsed = subscribeRequestSchema.safeParse(payload);
      if (!parsed.success) return;
      const room =
        parsed.data.channel === 'event'
          ? eventRoom(parsed.data.eventId)
          : manageRoom(parsed.data.eventId);
      void socket.leave(room);
    });
  });

  return {
    io,
    close: async () => {
      await io.close().catch(() => undefined);
      await Promise.allSettled([pubClient.quit(), subClient.quit()]);
    },
  };
}
