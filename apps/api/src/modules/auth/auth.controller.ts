import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  verifyEmailSchema,
} from '@festpass/shared';
import type { Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { generateCodeVerifier, generateState } from 'arctic';
import type { Logger } from 'pino';
import { UnauthenticatedError } from '../../lib/errors';
import { parseBody } from '../../lib/validation';
import { getAuth } from '../../middleware/require-auth';
import type { UserService } from '../users/user.service';
import {
  type CookieConfig,
  clearOAuthStateCookie,
  clearSessionCookies,
  OAUTH_STATE_COOKIE,
  readCookie,
  REFRESH_TOKEN_COOKIE,
  setOAuthStateCookie,
  setSessionCookies,
} from './auth.cookies';
import type { AuthService, ClientInfo, IssuedSession } from './auth.service';
import type { GoogleAuthProvider } from './google';

const oauthStateSchema = z.object({ state: z.string(), codeVerifier: z.string() });

export interface AuthControllerOptions {
  cookies: CookieConfig;
  webOrigin: string;
}

function parseJson(value: string | undefined): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function clientInfo(req: Request): ClientInfo {
  return { userAgent: req.get('user-agent')?.slice(0, 512), ipAddress: req.ip };
}

export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UserService,
    private readonly options: AuthControllerOptions,
    private readonly logger: Logger,
    private readonly google?: GoogleAuthProvider,
  ) {}

  signUp: RequestHandler = async (req, res) => {
    const session = await this.auth.signUp(parseBody(signUpSchema, req), clientInfo(req));
    await this.respondWithSession(res, session, 201);
  };

  signIn: RequestHandler = async (req, res) => {
    const session = await this.auth.signIn(parseBody(signInSchema, req), clientInfo(req));
    await this.respondWithSession(res, session, 200);
  };

  refresh: RequestHandler = async (req, res) => {
    const token = readCookie(req, REFRESH_TOKEN_COOKIE);
    try {
      if (!token) throw new UnauthenticatedError('Your session has ended. Sign in again.');
      setSessionCookies(res, await this.auth.refresh(token), this.options.cookies);
      res.status(204).end();
    } catch (error) {
      clearSessionCookies(res, this.options.cookies);
      throw error;
    }
  };

  signOut: RequestHandler = async (req, res) => {
    await this.auth.signOut(readCookie(req, REFRESH_TOKEN_COOKIE));
    clearSessionCookies(res, this.options.cookies);
    res.status(204).end();
  };

  signOutEverywhere: RequestHandler = async (req, res) => {
    await this.auth.signOutEverywhere(getAuth(req).userId);
    clearSessionCookies(res, this.options.cookies);
    res.status(204).end();
  };

  resendEmailVerification: RequestHandler = async (req, res) => {
    await this.auth.resendEmailVerification(getAuth(req).userId);
    res.status(202).end();
  };

  verifyEmail: RequestHandler = async (req, res) => {
    await this.auth.verifyEmail(parseBody(verifyEmailSchema, req).token);
    res.status(204).end();
  };

  forgotPassword: RequestHandler = async (req, res) => {
    await this.auth.requestPasswordReset(parseBody(forgotPasswordSchema, req).email);
    res.status(202).end();
  };

  resetPassword: RequestHandler = async (req, res) => {
    const { token, password } = parseBody(resetPasswordSchema, req);
    await this.auth.resetPassword(token, password);
    clearSessionCookies(res, this.options.cookies);
    res.status(204).end();
  };

  startGoogleSignIn: RequestHandler = (_req, res) => {
    if (!this.google) {
      res.redirect(this.webUrl('/sign-in?error=google-unavailable'));
      return;
    }
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    setOAuthStateCookie(res, JSON.stringify({ state, codeVerifier }), this.options.cookies);
    res.redirect(this.google.authorizationUrl(state, codeVerifier).toString());
  };

  finishGoogleSignIn: RequestHandler = async (req, res) => {
    const stored = oauthStateSchema.safeParse(parseJson(readCookie(req, OAUTH_STATE_COOKIE)));
    clearOAuthStateCookie(res, this.options.cookies);

    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    if (!this.google || !stored.success || !code || state !== stored.data.state) {
      res.redirect(this.webUrl('/sign-in?error=google'));
      return;
    }

    try {
      const profile = await this.google.exchangeCode(code, stored.data.codeVerifier);
      const session = await this.auth.signInWithGoogle(profile, clientInfo(req));
      setSessionCookies(res, session, this.options.cookies);
      res.redirect(this.webUrl('/account'));
    } catch (error) {
      this.logger.warn({ err: error }, 'Google sign-in failed');
      res.redirect(this.webUrl('/sign-in?error=google'));
    }
  };

  private async respondWithSession(res: Response, session: IssuedSession, status: number) {
    setSessionCookies(res, session, this.options.cookies);
    res.status(status).json({ user: await this.users.getCurrentUser(session.userId) });
  }

  private webUrl(path: string) {
    return new URL(path, this.options.webOrigin).toString();
  }
}
