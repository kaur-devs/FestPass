import { Router } from 'express';
import { rateLimiter, type RateLimitRule } from '../../middleware/rate-limit';
import type { RequestHandler } from 'express';
import type { AuthController } from './auth.controller';

export interface AuthRateLimits {
  signIn: RateLimitRule;
  signUp: RateLimitRule;
  email: RateLimitRule;
}

export const DEFAULT_AUTH_RATE_LIMITS: AuthRateLimits = {
  signIn: { windowMs: 15 * 60 * 1000, limit: 10 },
  signUp: { windowMs: 60 * 60 * 1000, limit: 10 },
  email: { windowMs: 60 * 60 * 1000, limit: 5 },
};

export function createAuthRouter(
  controller: AuthController,
  authenticate: RequestHandler,
  limits: AuthRateLimits,
): Router {
  const router = Router();
  const emailLimiter = rateLimiter(limits.email);

  router.post('/auth/sign-up', rateLimiter(limits.signUp), controller.signUp);
  router.post('/auth/sign-in', rateLimiter(limits.signIn), controller.signIn);
  router.post('/auth/refresh', controller.refresh);
  router.post('/auth/sign-out', controller.signOut);
  router.post('/auth/sign-out-everywhere', authenticate, controller.signOutEverywhere);

  router.post('/auth/verify-email', controller.verifyEmail);
  router.post(
    '/auth/verification-email',
    authenticate,
    emailLimiter,
    controller.resendEmailVerification,
  );
  router.post('/auth/forgot-password', emailLimiter, controller.forgotPassword);
  router.post('/auth/reset-password', controller.resetPassword);

  router.get('/auth/google', controller.startGoogleSignIn);
  router.get('/auth/google/callback', controller.finishGoogleSignIn);

  return router;
}
