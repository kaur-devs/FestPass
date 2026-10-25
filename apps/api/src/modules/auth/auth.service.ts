import { AuthProvider, getConstraintViolation, TokenPurpose, type User } from '@festpass/db';
import { ErrorCode, type SignInData, type SignUpData } from '@festpass/shared';
import type { Logger } from 'pino';
import { generateToken, hashToken } from '../../lib/crypto';
import {
  ConflictError,
  ForbiddenError,
  InvalidTokenError,
  UnauthenticatedError,
} from '../../lib/errors';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../lib/password';
import type { AccessTokenService } from './access-tokens';
import type { AuthEmails } from './auth.emails';
import type { AuthRepository } from './auth.repository';
import type { GoogleProfile } from './google';

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_LIFETIME_MS = 30 * DAY_MS;
const REFRESH_TOKEN_IDLE_MS = 7 * DAY_MS;
const EMAIL_VERIFICATION_TTL_MS = DAY_MS;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export interface ClientInfo {
  userAgent: string | undefined;
  ipAddress: string | undefined;
}

export interface IssuedSession {
  userId: string;
  accessToken: string;
  accessTokenTtlSeconds: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly accessTokens: AccessTokenService,
    private readonly emails: AuthEmails,
    private readonly logger: Logger,
  ) {}

  async signUp(input: SignUpData, client: ClientInfo): Promise<IssuedSession> {
    const emailTaken = new ConflictError(
      'An account with this email already exists. Sign in instead.',
      ErrorCode.EmailTaken,
    );
    if (await this.repository.findUserByEmail(input.email)) throw emailTaken;

    let user: User;
    try {
      user = await this.repository.createUser({
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
      });
    } catch (error) {
      if (getConstraintViolation(error)?.constraint === 'users_email_key') throw emailTaken;
      throw error;
    }

    await this.sendEmailVerification(user);
    return this.startSession(user.id, client);
  }

  async signIn(input: SignInData, client: ClientInfo): Promise<IssuedSession> {
    const user = await this.repository.findUserByEmail(input.email);
    const valid = user?.passwordHash
      ? await verifyPassword(user.passwordHash, input.password)
      : await burnPasswordCheck(input.password).then(() => false);

    if (!user || !valid) {
      throw new UnauthenticatedError(
        'Email or password is incorrect.',
        ErrorCode.InvalidCredentials,
      );
    }
    return this.startSession(user.id, client);
  }

  async refresh(refreshToken: string): Promise<IssuedSession> {
    const invalid = new UnauthenticatedError('Your session has ended. Sign in again.');
    const token = await this.repository.findRefreshToken(hashToken(refreshToken));
    if (!token) throw invalid;

    const now = new Date();
    if (token.session.revokedAt || token.session.expiresAt <= now || token.expiresAt <= now) {
      throw invalid;
    }

    if (token.usedAt) {
      await this.handleRefreshTokenReuse(token.sessionId, token.session.userId);
      throw invalid;
    }

    const nextToken = generateToken();
    const nextExpiresAt = this.refreshTokenExpiry(token.session.expiresAt);
    const rotated = await this.repository.rotateRefreshToken({
      currentTokenId: token.id,
      sessionId: token.sessionId,
      nextTokenHash: hashToken(nextToken),
      nextTokenExpiresAt: nextExpiresAt,
    });
    if (!rotated) {
      await this.handleRefreshTokenReuse(token.sessionId, token.session.userId);
      throw invalid;
    }

    return {
      userId: token.session.userId,
      accessToken: await this.accessTokens.sign({
        userId: token.session.userId,
        sessionId: token.sessionId,
      }),
      accessTokenTtlSeconds: this.accessTokens.ttlSeconds,
      refreshToken: nextToken,
      refreshTokenExpiresAt: nextExpiresAt,
    };
  }

  async signOut(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const token = await this.repository.findRefreshToken(hashToken(refreshToken));
    if (token) await this.repository.revokeSession(token.sessionId);
  }

  signOutEverywhere(userId: string): Promise<void> {
    return this.repository.revokeAllSessions(userId);
  }

  async resendEmailVerification(userId: string): Promise<void> {
    const user = await this.repository.findUserById(userId);
    if (!user || user.emailVerifiedAt) return;
    await this.sendEmailVerification(user);
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.repository.consumeVerificationToken(
      hashToken(token),
      TokenPurpose.EMAIL_VERIFICATION,
    );
    if (!userId) throw new InvalidTokenError();
    await this.repository.markEmailVerified(userId);
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.repository.findUserByEmail(email);
    if (!user) return;

    const token = generateToken();
    await this.repository.createVerificationToken({
      userId: user.id,
      purpose: TokenPurpose.PASSWORD_RESET,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    });
    await this.deliver(() => this.emails.sendPasswordReset(user, token), user.id);
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const userId = await this.repository.consumeVerificationToken(
      hashToken(token),
      TokenPurpose.PASSWORD_RESET,
    );
    if (!userId) throw new InvalidTokenError();
    await this.repository.replacePassword(userId, await hashPassword(password));
  }

  async signInWithGoogle(profile: GoogleProfile, client: ClientInfo): Promise<IssuedSession> {
    const account = { provider: AuthProvider.GOOGLE, providerAccountId: profile.id };

    const linkedUser = await this.repository.findUserByAccount(account);
    if (linkedUser) return this.startSession(linkedUser.id, client);

    if (!profile.emailVerified) {
      throw new ForbiddenError('Your Google email address is not verified.');
    }

    const existingUser = await this.repository.findUserByEmail(profile.email);
    if (existingUser) {
      await this.repository.linkAccount(existingUser.id, account);
      return this.startSession(existingUser.id, client);
    }

    const user = await this.repository.createUserWithAccount(
      { email: profile.email, name: profile.name ?? profile.email.split('@')[0] ?? profile.email },
      account,
    );
    return this.startSession(user.id, client);
  }

  private async startSession(userId: string, client: ClientInfo): Promise<IssuedSession> {
    const refreshToken = generateToken();
    const sessionExpiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
    const refreshTokenExpiresAt = this.refreshTokenExpiry(sessionExpiresAt);

    const sessionId = await this.repository.createSession({
      userId,
      userAgent: client.userAgent,
      ipAddress: client.ipAddress,
      expiresAt: sessionExpiresAt,
      refreshTokenHash: hashToken(refreshToken),
      refreshTokenExpiresAt,
    });

    return {
      userId,
      accessToken: await this.accessTokens.sign({ userId, sessionId }),
      accessTokenTtlSeconds: this.accessTokens.ttlSeconds,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }

  private refreshTokenExpiry(sessionExpiresAt: Date): Date {
    return new Date(Math.min(Date.now() + REFRESH_TOKEN_IDLE_MS, sessionExpiresAt.getTime()));
  }

  private async handleRefreshTokenReuse(sessionId: string, userId: string) {
    this.logger.warn({ sessionId, userId }, 'Refresh token reuse detected; revoking session');
    await this.repository.revokeSession(sessionId);
  }

  private async sendEmailVerification(user: User) {
    const token = generateToken();
    await this.repository.createVerificationToken({
      userId: user.id,
      purpose: TokenPurpose.EMAIL_VERIFICATION,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    });
    await this.deliver(() => this.emails.sendEmailVerification(user, token), user.id);
  }

  private async deliver(send: () => Promise<void>, userId: string) {
    try {
      await send();
    } catch (error) {
      this.logger.error({ err: error, userId }, 'Failed to send email');
    }
  }
}
