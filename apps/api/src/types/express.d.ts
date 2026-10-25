import type { AccessTokenClaims } from '../modules/auth/access-tokens';

declare global {
  namespace Express {
    interface Request {
      auth?: AccessTokenClaims;
    }
  }
}

export {};
