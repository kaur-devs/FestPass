import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { AccessTokenService } from './access-tokens';

const secret = 'a'.repeat(32);
const claims = { userId: 'user-1', sessionId: 'session-1' };

describe('AccessTokenService', () => {
  it('round-trips its own tokens', async () => {
    const tokens = new AccessTokenService(secret);

    await expect(tokens.verify(await tokens.sign(claims))).resolves.toEqual(claims);
  });

  it('rejects tokens signed with another secret', async () => {
    const forged = await new AccessTokenService('b'.repeat(32)).sign(claims);

    await expect(new AccessTokenService(secret).verify(forged)).resolves.toBeUndefined();
  });

  it('rejects expired tokens', async () => {
    const tokens = new AccessTokenService(secret, -1);

    await expect(tokens.verify(await tokens.sign(claims))).resolves.toBeUndefined();
  });

  it('rejects tokens without the expected issuer and audience', async () => {
    const foreign = await new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret));

    await expect(new AccessTokenService(secret).verify(foreign)).resolves.toBeUndefined();
  });

  it('rejects malformed input', async () => {
    await expect(new AccessTokenService(secret).verify('not-a-jwt')).resolves.toBeUndefined();
  });
});
