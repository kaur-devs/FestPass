import { errors, jwtVerify, SignJWT } from 'jose';

const ISSUER = 'festpass-api';
const AUDIENCE = 'festpass-web';
const ALGORITHM = 'HS256';

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
}

export class AccessTokenService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    readonly ttlSeconds = 15 * 60,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  sign({ userId, sessionId }: AccessTokenClaims): Promise<string> {
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.ttlSeconds}s`)
      .sign(this.key);
  }

  async verify(token: string): Promise<AccessTokenClaims | undefined> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: [ALGORITHM],
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return undefined;
      return { userId: payload.sub, sessionId: payload.sid };
    } catch (error) {
      if (error instanceof errors.JOSEError) return undefined;
      throw error;
    }
  }
}
