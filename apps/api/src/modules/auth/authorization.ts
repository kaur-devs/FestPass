import { OrganizationRole, PlatformRole, type PrismaClient } from '@festpass/db';
import { ForbiddenError } from '../../lib/errors';

const MANAGING_ROLES = [OrganizationRole.OWNER, OrganizationRole.ORGANIZER];

export class AuthorizationService {
  constructor(private readonly db: PrismaClient) {}

  async isAdmin(userId: string): Promise<boolean> {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { role: true } });
    return user?.role === PlatformRole.ADMIN;
  }

  async requireAdmin(userId: string): Promise<void> {
    if (!(await this.isAdmin(userId))) throw new ForbiddenError();
  }

  async requireOrganizationRole(
    userId: string,
    organizationId: string,
    roles: readonly OrganizationRole[] = MANAGING_ROLES,
  ): Promise<void> {
    const membership = await this.db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { role: true },
    });
    if (membership && roles.includes(membership.role)) return;
    if (await this.isAdmin(userId)) return;
    throw new ForbiddenError();
  }

  async requireEventManager(userId: string, eventId: string): Promise<void> {
    const event = await this.db.event.findUnique({
      where: { id: eventId },
      select: { organizationId: true },
    });
    if (!event) throw new ForbiddenError();
    await this.requireOrganizationRole(userId, event.organizationId);
  }

  async requireEventScanner(userId: string, eventId: string): Promise<void> {
    const volunteer = await this.db.eventVolunteer.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { userId: true },
    });
    if (volunteer) return;
    await this.requireEventManager(userId, eventId);
  }
}
