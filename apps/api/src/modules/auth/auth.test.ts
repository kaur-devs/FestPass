import { apiErrorResponseSchema, type CurrentUser, ErrorCode } from '@festpass/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, resetDatabase } from '../../test/database';
import { createTestContext, getCookie } from '../../test/context';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, SIGNED_IN_COOKIE } from './auth.cookies';

const riya = { name: 'Riya Sharma', email: 'riya@festpass.test', password: 'utsav-pro-night-2027' };

function userOf(res: { body: unknown }): CurrentUser {
  return (res.body as { user: CurrentUser }).user;
}

function errorCode(body: unknown) {
  return apiErrorResponseSchema.parse(body).error.code;
}

let ctx: ReturnType<typeof createTestContext>;

beforeEach(async () => {
  await resetDatabase();
  ctx = createTestContext();
});

afterAll(() => db.$disconnect());

async function signUp(agent = request.agent(ctx.app)) {
  const res = await agent.post('/auth/sign-up').send(riya);
  expect(res.status).toBe(201);
  return { agent, res };
}

describe('sign-up', () => {
  it('creates an account, starts a session and sends a verification email', async () => {
    const { agent, res } = await signUp();

    expect(userOf(res)).toMatchObject({
      email: riya.email,
      name: riya.name,
      role: 'USER',
      emailVerified: false,
      hasPassword: true,
    });
    expect(getCookie(res, ACCESS_TOKEN_COOKIE)).toBeDefined();
    expect(getCookie(res, REFRESH_TOKEN_COOKIE)).toBeDefined();
    expect(getCookie(res, SIGNED_IN_COOKIE)).toBe('1');
    expect(ctx.emails.lastTokenFor(riya.email, '/verify-email')).toBeTruthy();

    const me = await agent.get('/me');
    expect(me.status).toBe(200);
    expect(userOf(me).email).toBe(riya.email);
  });

  it('marks session cookies httpOnly and SameSite=Lax', async () => {
    const { res } = await signUp();
    const cookies = res.headers['set-cookie'] as unknown as string[];

    for (const cookie of cookies) {
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Lax/);
    }
    expect(cookies.find((c) => c.startsWith(`${REFRESH_TOKEN_COOKIE}=`))).toMatch(/Path=\/auth/);
  });

  it('stores a password hash, never the password', async () => {
    await signUp();
    const user = await db.user.findUniqueOrThrow({ where: { email: riya.email } });

    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(riya.password);
  });

  it('normalises the email address', async () => {
    const res = await request(ctx.app)
      .post('/auth/sign-up')
      .send({ ...riya, email: '  Riya@FestPass.TEST ' });

    expect(userOf(res).email).toBe(riya.email);
  });

  it('rejects an email that is already registered, whatever its case', async () => {
    await signUp();
    const res = await request(ctx.app)
      .post('/auth/sign-up')
      .send({ ...riya, email: 'RIYA@festpass.test' });

    expect(res.status).toBe(409);
    expect(errorCode(res.body)).toBe(ErrorCode.EmailTaken);
  });

  it('reports invalid fields', async () => {
    const res = await request(ctx.app)
      .post('/auth/sign-up')
      .send({ name: '', email: 'not-an-email', password: 'short' });

    expect(res.status).toBe(422);
    const { details } = apiErrorResponseSchema.parse(res.body).error;
    expect(details).toMatchObject({
      fieldErrors: {
        name: ['Enter your name.'],
        email: ['Enter a valid email address.'],
        password: ['Use at least 10 characters.'],
      },
    });
  });
});

describe('sign-in', () => {
  beforeEach(() => signUp());

  it('starts a session with the right password', async () => {
    const agent = request.agent(ctx.app);
    const res = await agent
      .post('/auth/sign-in')
      .send({ email: riya.email, password: riya.password });

    expect(res.status).toBe(200);
    expect(userOf(res).email).toBe(riya.email);
    expect((await agent.get('/me')).status).toBe(200);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await request(ctx.app)
      .post('/auth/sign-in')
      .send({ email: riya.email, password: 'not-the-password' });
    const unknownEmail = await request(ctx.app)
      .post('/auth/sign-in')
      .send({ email: 'nobody@festpass.test', password: 'not-the-password' });

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(errorCode(res.body)).toBe(ErrorCode.InvalidCredentials);
      expect(getCookie(res, ACCESS_TOKEN_COOKIE)).toBeUndefined();
    }
  });

  it('limits repeated attempts', async () => {
    const limited = createTestContext({
      authRateLimits: { signIn: { windowMs: 60_000, limit: 2 } },
    });
    const attempt = () =>
      request(limited.app)
        .post('/auth/sign-in')
        .send({ email: riya.email, password: 'wrong-password' });

    await attempt();
    await attempt();
    const res = await attempt();

    expect(res.status).toBe(429);
    expect(errorCode(res.body)).toBe(ErrorCode.RateLimited);
  });
});

describe('protected routes', () => {
  it('require a valid access token', async () => {
    const missing = await request(ctx.app).get('/me');
    const forged = await request(ctx.app).get('/me').set('Cookie', `${ACCESS_TOKEN_COOKIE}=forged`);

    expect(missing.status).toBe(401);
    expect(forged.status).toBe(401);
  });
});

describe('refresh', () => {
  it('rotates the refresh token', async () => {
    const { agent, res } = await signUp();
    const first = getCookie(res, REFRESH_TOKEN_COOKIE);

    const refreshed = await agent.post('/auth/refresh');

    expect(refreshed.status).toBe(204);
    const second = getCookie(refreshed, REFRESH_TOKEN_COOKIE);
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect((await agent.get('/me')).status).toBe(200);
  });

  it('revokes the whole session when an old refresh token is reused', async () => {
    const { agent, res } = await signUp();
    const stolen = getCookie(res, REFRESH_TOKEN_COOKIE);
    await agent.post('/auth/refresh');

    const replay = await request(ctx.app)
      .post('/auth/refresh')
      .set('Cookie', `${REFRESH_TOKEN_COOKIE}=${stolen ?? ''}`);
    const legitimate = await agent.post('/auth/refresh');

    expect(replay.status).toBe(401);
    expect(legitimate.status).toBe(401);
    const session = await db.session.findFirstOrThrow();
    expect(session.revokedAt).not.toBeNull();
  });

  it('refuses an expired session and clears the cookies', async () => {
    const { agent } = await signUp();
    await db.session.updateMany({
      data: {
        createdAt: new Date(Date.now() - 31 * 86_400_000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const res = await agent.post('/auth/refresh');

    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']?.toString()).toMatch(new RegExp(`${REFRESH_TOKEN_COOKIE}=;`));
  });

  it('refuses a request without a refresh token', async () => {
    expect((await request(ctx.app).post('/auth/refresh')).status).toBe(401);
  });
});

describe('sign-out', () => {
  it('ends the current session', async () => {
    const { agent, res } = await signUp();
    const refreshToken = getCookie(res, REFRESH_TOKEN_COOKIE);

    expect((await agent.post('/auth/sign-out')).status).toBe(204);

    const refresh = await request(ctx.app)
      .post('/auth/refresh')
      .set('Cookie', `${REFRESH_TOKEN_COOKIE}=${refreshToken ?? ''}`);
    expect(refresh.status).toBe(401);
  });

  it('can end every session for the account', async () => {
    const { agent: laptop } = await signUp();
    const phone = request.agent(ctx.app);
    await phone.post('/auth/sign-in').send({ email: riya.email, password: riya.password });

    expect((await laptop.post('/auth/sign-out-everywhere')).status).toBe(204);

    expect((await phone.post('/auth/refresh')).status).toBe(401);
    expect(await db.session.count({ where: { revokedAt: null } })).toBe(0);
  });
});

describe('email verification', () => {
  it('verifies the email with the emailed link, once', async () => {
    const { agent } = await signUp();
    const token = ctx.emails.lastTokenFor(riya.email, '/verify-email');

    expect((await agent.post('/auth/verify-email').send({ token })).status).toBe(204);
    expect(userOf(await agent.get('/me')).emailVerified).toBe(true);

    const reused = await agent.post('/auth/verify-email').send({ token });
    expect(reused.status).toBe(400);
    expect(errorCode(reused.body)).toBe(ErrorCode.InvalidToken);
  });

  it('invalidates the previous link when a new one is sent', async () => {
    const { agent } = await signUp();
    const oldToken = ctx.emails.lastTokenFor(riya.email, '/verify-email');

    expect((await agent.post('/auth/verification-email')).status).toBe(202);
    const newToken = ctx.emails.lastTokenFor(riya.email, '/verify-email');

    expect(newToken).not.toBe(oldToken);
    expect((await agent.post('/auth/verify-email').send({ token: oldToken })).status).toBe(400);
    expect((await agent.post('/auth/verify-email').send({ token: newToken })).status).toBe(204);
  });
});

describe('password reset', () => {
  beforeEach(() => signUp());

  it('does not reveal whether an email is registered', async () => {
    const known = await request(ctx.app).post('/auth/forgot-password').send({ email: riya.email });
    const unknown = await request(ctx.app)
      .post('/auth/forgot-password')
      .send({ email: 'nobody@festpass.test' });

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(ctx.emails.sent.filter((email) => email.to === 'nobody@festpass.test')).toHaveLength(0);
  });

  it('sets a new password and signs out every session', async () => {
    const otherDevice = request.agent(ctx.app);
    await otherDevice.post('/auth/sign-in').send({ email: riya.email, password: riya.password });
    await request(ctx.app).post('/auth/forgot-password').send({ email: riya.email });
    const token = ctx.emails.lastTokenFor(riya.email, '/reset-password');
    const password = 'a-brand-new-password';

    expect(
      (await request(ctx.app).post('/auth/reset-password').send({ token, password })).status,
    ).toBe(204);

    expect((await otherDevice.post('/auth/refresh')).status).toBe(401);
    const oldLogin = await request(ctx.app)
      .post('/auth/sign-in')
      .send({ email: riya.email, password: riya.password });
    const newLogin = await request(ctx.app)
      .post('/auth/sign-in')
      .send({ email: riya.email, password });
    expect(oldLogin.status).toBe(401);
    expect(newLogin.status).toBe(200);
    expect(userOf(newLogin).emailVerified).toBe(true);
  });

  it('accepts each reset link once', async () => {
    await request(ctx.app).post('/auth/forgot-password').send({ email: riya.email });
    const token = ctx.emails.lastTokenFor(riya.email, '/reset-password');
    const reset = () =>
      request(ctx.app)
        .post('/auth/reset-password')
        .send({ token, password: 'a-brand-new-password' });

    expect((await reset()).status).toBe(204);
    expect((await reset()).status).toBe(400);
  });

  it('rejects an expired link', async () => {
    await request(ctx.app).post('/auth/forgot-password').send({ email: riya.email });
    const token = ctx.emails.lastTokenFor(riya.email, '/reset-password');
    await db.verificationToken.updateMany({
      where: { purpose: 'PASSWORD_RESET' },
      data: {
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const res = await request(ctx.app)
      .post('/auth/reset-password')
      .send({ token, password: 'a-brand-new-password' });

    expect(res.status).toBe(400);
    expect(errorCode(res.body)).toBe(ErrorCode.InvalidToken);
  });
});

describe('Google sign-in', () => {
  async function completeGoogleFlow(agent = request.agent(ctx.app), code = 'valid-code') {
    const start = await agent.get('/auth/google');
    expect(start.status).toBe(302);
    const state = new URL(start.headers.location ?? '').searchParams.get('state') ?? '';
    return agent.get('/auth/google/callback').query({ code, state });
  }

  it('creates a verified account on first sign-in', async () => {
    const agent = request.agent(ctx.app);
    const res = await completeGoogleFlow(agent);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:3000/account');
    const me = await agent.get('/me');
    expect(userOf(me)).toMatchObject({
      email: ctx.google.profile.email,
      name: ctx.google.profile.name,
      emailVerified: true,
      hasPassword: false,
    });
  });

  it('links Google to an existing account with the same verified email', async () => {
    await signUp();
    ctx.google.profile = { ...ctx.google.profile, email: riya.email };

    await completeGoogleFlow();

    expect(await db.user.count()).toBe(1);
    const user = await db.user.findUniqueOrThrow({
      where: { email: riya.email },
      include: { accounts: true },
    });
    expect(user.accounts).toHaveLength(1);
    expect(user.emailVerifiedAt).not.toBeNull();
  });

  it('refuses to link an unverified Google email', async () => {
    await signUp();
    ctx.google.profile = { ...ctx.google.profile, email: riya.email, emailVerified: false };

    const res = await completeGoogleFlow();

    expect(res.headers.location).toBe('http://localhost:3000/sign-in?error=google');
    expect(await db.account.count()).toBe(0);
  });

  it('rejects a callback whose state does not match', async () => {
    const agent = request.agent(ctx.app);
    await agent.get('/auth/google');

    const res = await agent
      .get('/auth/google/callback')
      .query({ code: 'valid-code', state: 'forged' });

    expect(res.headers.location).toBe('http://localhost:3000/sign-in?error=google');
    expect(getCookie(res, ACCESS_TOKEN_COOKIE)).toBeUndefined();
  });

  it('sends the user back with an error when Google rejects the code', async () => {
    const res = await completeGoogleFlow(request.agent(ctx.app), 'expired-code');

    expect(res.headers.location).toBe('http://localhost:3000/sign-in?error=google');
  });
});
