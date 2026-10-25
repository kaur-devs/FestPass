import { decodeIdToken, Google } from 'arctic';
import { z } from 'zod';

const SCOPES = ['openid', 'email', 'profile'];

const idTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.email(),
  email_verified: z.boolean(),
  name: z.string().optional(),
});

export interface GoogleProfile {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | undefined;
}

export interface GoogleAuthProvider {
  authorizationUrl(state: string, codeVerifier: string): URL;
  exchangeCode(code: string, codeVerifier: string): Promise<GoogleProfile>;
}

export class ArcticGoogleAuthProvider implements GoogleAuthProvider {
  private readonly client: Google;

  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    this.client = new Google(clientId, clientSecret, redirectUri);
  }

  authorizationUrl(state: string, codeVerifier: string): URL {
    return this.client.createAuthorizationURL(state, codeVerifier, SCOPES);
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<GoogleProfile> {
    const tokens = await this.client.validateAuthorizationCode(code, codeVerifier);
    const claims = idTokenClaimsSchema.parse(decodeIdToken(tokens.idToken()));
    return {
      id: claims.sub,
      email: claims.email.toLowerCase(),
      emailVerified: claims.email_verified,
      name: claims.name,
    };
  }
}
