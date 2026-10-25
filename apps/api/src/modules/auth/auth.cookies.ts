import type { CookieOptions, Request, Response } from 'express';

export const ACCESS_TOKEN_COOKIE = 'fp_at';
export const REFRESH_TOKEN_COOKIE = 'fp_rt';
export const SIGNED_IN_COOKIE = 'fp_signed_in';
export const OAUTH_STATE_COOKIE = 'fp_oauth';

export const REFRESH_TOKEN_PATH = '/auth';
export const OAUTH_STATE_PATH = '/auth/google';

export interface CookieConfig {
  secure: boolean;
  domain?: string | undefined;
}

export interface SessionCookies {
  accessToken: string;
  accessTokenTtlSeconds: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

function baseOptions(config: CookieConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: 'lax',
    ...(config.domain && { domain: config.domain }),
  };
}

export function setSessionCookies(res: Response, cookies: SessionCookies, config: CookieConfig) {
  const options = baseOptions(config);
  res.cookie(ACCESS_TOKEN_COOKIE, cookies.accessToken, {
    ...options,
    path: '/',
    maxAge: cookies.accessTokenTtlSeconds * 1000,
  });
  res.cookie(REFRESH_TOKEN_COOKIE, cookies.refreshToken, {
    ...options,
    path: REFRESH_TOKEN_PATH,
    expires: cookies.refreshTokenExpiresAt,
  });
  res.cookie(SIGNED_IN_COOKIE, '1', {
    ...options,
    path: '/',
    expires: cookies.refreshTokenExpiresAt,
  });
}

export function clearSessionCookies(res: Response, config: CookieConfig) {
  const options = baseOptions(config);
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...options, path: '/' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...options, path: REFRESH_TOKEN_PATH });
  res.clearCookie(SIGNED_IN_COOKIE, { ...options, path: '/' });
}

export function setOAuthStateCookie(res: Response, value: string, config: CookieConfig) {
  res.cookie(OAUTH_STATE_COOKIE, value, {
    ...baseOptions(config),
    path: OAUTH_STATE_PATH,
    maxAge: 10 * 60 * 1000,
  });
}

export function clearOAuthStateCookie(res: Response, config: CookieConfig) {
  res.clearCookie(OAUTH_STATE_COOKIE, { ...baseOptions(config), path: OAUTH_STATE_PATH });
}

export function readCookie(req: Request, name: string): string | undefined {
  const value: unknown = (req.cookies as Record<string, unknown>)[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
