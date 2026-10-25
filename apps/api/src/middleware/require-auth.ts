import type { Request, RequestHandler } from 'express';
import { UnauthenticatedError } from '../lib/errors';
import type { AccessTokenClaims, AccessTokenService } from '../modules/auth/access-tokens';
import { ACCESS_TOKEN_COOKIE, readCookie } from '../modules/auth/auth.cookies';

export function requireAuth(accessTokens: AccessTokenService): RequestHandler {
  return async (req, _res, next) => {
    const token = readCookie(req, ACCESS_TOKEN_COOKIE);
    const claims = token ? await accessTokens.verify(token) : undefined;
    if (!claims) throw new UnauthenticatedError();
    req.auth = claims;
    next();
  };
}

export function getAuth(req: Request): AccessTokenClaims {
  if (!req.auth) throw new UnauthenticatedError();
  return req.auth;
}
