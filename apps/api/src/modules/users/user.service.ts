import type { PrismaClient } from '@festpass/db';
import type { CurrentUser } from '@festpass/shared';
import { NotFoundError } from '../../lib/errors';

export class UserService {
  constructor(private readonly db: PrismaClient) {}

  async getCurrentUser(userId: string): Promise<CurrentUser> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: {
        memberships: { include: { organization: true }, orderBy: { createdAt: 'asc' } },
        volunteering: {
          include: { event: { select: { title: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!user) throw new NotFoundError('This account no longer exists.');

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
      hasPassword: user.passwordHash !== null,
      organizations: user.memberships.map(({ organization, role }) => ({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role,
      })),
      volunteering: user.volunteering.map(({ eventId, event, gate }) => ({
        eventId,
        eventTitle: event.title,
        gate,
      })),
    };
  }
}
