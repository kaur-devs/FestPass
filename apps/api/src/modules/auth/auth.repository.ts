import type { AuthProvider, PrismaClient, TokenPurpose } from '@festpass/db';

export interface NewSession {
  userId: string;
  userAgent: string | undefined;
  ipAddress: string | undefined;
  expiresAt: Date;
  refreshTokenHash: string;
  refreshTokenExpiresAt: Date;
}

export interface RefreshTokenRotation {
  currentTokenId: string;
  sessionId: string;
  nextTokenHash: string;
  nextTokenExpiresAt: Date;
}

export interface ExternalAccount {
  provider: AuthProvider;
  providerAccountId: string;
}

export class AuthRepository {
  constructor(private readonly db: PrismaClient) {}

  findUserByEmail(email: string) {
    return this.db.user.findUnique({ where: { email } });
  }

  findUserById(id: string) {
    return this.db.user.findUnique({ where: { id } });
  }

  createUser(data: { email: string; name: string; passwordHash: string }) {
    return this.db.user.create({ data });
  }

  async createSession(session: NewSession) {
    const { id } = await this.db.session.create({
      data: {
        userId: session.userId,
        userAgent: session.userAgent ?? null,
        ipAddress: session.ipAddress ?? null,
        expiresAt: session.expiresAt,
        refreshTokens: {
          create: { tokenHash: session.refreshTokenHash, expiresAt: session.refreshTokenExpiresAt },
        },
      },
      select: { id: true },
    });
    return id;
  }

  findRefreshToken(tokenHash: string) {
    return this.db.refreshToken.findUnique({ where: { tokenHash }, include: { session: true } });
  }

  rotateRefreshToken(rotation: RefreshTokenRotation): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.refreshToken.updateMany({
        where: { id: rotation.currentTokenId, usedAt: null },
        data: { usedAt: now },
      });
      if (count === 0) return false;

      await tx.refreshToken.create({
        data: {
          sessionId: rotation.sessionId,
          tokenHash: rotation.nextTokenHash,
          expiresAt: rotation.nextTokenExpiresAt,
        },
      });
      await tx.session.update({ where: { id: rotation.sessionId }, data: { lastUsedAt: now } });
      return true;
    });
  }

  async revokeSession(sessionId: string) {
    await this.db.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(userId: string) {
    await this.db.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  createVerificationToken(data: {
    userId: string;
    purpose: TokenPurpose;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.db.$transaction([
      this.db.verificationToken.updateMany({
        where: { userId: data.userId, purpose: data.purpose, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.db.verificationToken.create({ data }),
    ]);
  }

  async consumeVerificationToken(tokenHash: string, purpose: TokenPurpose) {
    const now = new Date();
    const [token] = await this.db.verificationToken.updateManyAndReturn({
      where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
      select: { userId: true },
    });
    return token?.userId;
  }

  async markEmailVerified(userId: string) {
    await this.db.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
  }

  async replacePassword(userId: string, passwordHash: string) {
    const now = new Date();
    await this.db.$transaction([
      this.db.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.db.user.updateMany({
        where: { id: userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      }),
      this.db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
    ]);
  }

  findUserByAccount({ provider, providerAccountId }: ExternalAccount) {
    return this.db.account
      .findUnique({ where: { provider_providerAccountId: { provider, providerAccountId } } })
      .user();
  }

  async linkAccount(userId: string, account: ExternalAccount) {
    await this.db.$transaction([
      this.db.account.create({ data: { userId, ...account } }),
      this.db.user.updateMany({
        where: { id: userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);
  }

  createUserWithAccount(data: { email: string; name: string }, account: ExternalAccount) {
    return this.db.user.create({
      data: { ...data, emailVerifiedAt: new Date(), accounts: { create: account } },
    });
  }
}
