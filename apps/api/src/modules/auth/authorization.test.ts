import { OrganizationRole, PlatformRole, SeatingType } from '@festpass/db';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../lib/errors';
import { db, resetDatabase } from '../../test/database';
import { AuthorizationService } from './authorization';

const authorization = new AuthorizationService(db);

function createUser(role: PlatformRole = PlatformRole.USER) {
  return db.user.create({ data: { email: `${randomUUID()}@festpass.test`, name: 'Test', role } });
}

async function createOrganizationWithEvent() {
  const organization = await db.organization.create({
    data: { name: 'Utsav Fest Committee', slug: `utsav-${randomUUID()}` },
  });
  const startsAt = new Date(Date.now() + 86_400_000);
  const event = await db.event.create({
    data: {
      organizationId: organization.id,
      slug: `pro-night-${randomUUID()}`,
      title: 'Pro Night',
      venue: 'Main Auditorium',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      salesStartAt: new Date(),
      salesEndAt: startsAt,
      seatingType: SeatingType.RESERVED,
    },
  });
  return { organization, event };
}

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

describe('organization roles', () => {
  it('lets owners and organizers manage the organization', async () => {
    const { organization } = await createOrganizationWithEvent();
    const [owner, organizer] = await Promise.all([createUser(), createUser()]);
    await db.organizationMember.createMany({
      data: [
        { organizationId: organization.id, userId: owner.id, role: OrganizationRole.OWNER },
        { organizationId: organization.id, userId: organizer.id, role: OrganizationRole.ORGANIZER },
      ],
    });

    await expect(
      authorization.requireOrganizationRole(owner.id, organization.id),
    ).resolves.toBeUndefined();
    await expect(
      authorization.requireOrganizationRole(organizer.id, organization.id),
    ).resolves.toBeUndefined();
  });

  it('can restrict an action to owners', async () => {
    const { organization } = await createOrganizationWithEvent();
    const organizer = await createUser();
    await db.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: organizer.id,
        role: OrganizationRole.ORGANIZER,
      },
    });

    await expect(
      authorization.requireOrganizationRole(organizer.id, organization.id, [
        OrganizationRole.OWNER,
      ]),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses users outside the organization', async () => {
    const { organization } = await createOrganizationWithEvent();
    const stranger = await createUser();

    await expect(
      authorization.requireOrganizationRole(stranger.id, organization.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lets platform admins through', async () => {
    const { organization } = await createOrganizationWithEvent();
    const admin = await createUser(PlatformRole.ADMIN);

    await expect(
      authorization.requireOrganizationRole(admin.id, organization.id),
    ).resolves.toBeUndefined();
  });
});

describe('event scanning', () => {
  it('allows assigned volunteers and the organizing team, and no one else', async () => {
    const { organization, event } = await createOrganizationWithEvent();
    const [volunteer, organizer, student] = await Promise.all([
      createUser(),
      createUser(),
      createUser(),
    ]);
    await db.eventVolunteer.create({
      data: { eventId: event.id, userId: volunteer.id, gate: 'Gate 1' },
    });
    await db.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: organizer.id,
        role: OrganizationRole.ORGANIZER,
      },
    });

    await expect(
      authorization.requireEventScanner(volunteer.id, event.id),
    ).resolves.toBeUndefined();
    await expect(
      authorization.requireEventScanner(organizer.id, event.id),
    ).resolves.toBeUndefined();
    await expect(authorization.requireEventScanner(student.id, event.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('does not let volunteers manage the event', async () => {
    const { event } = await createOrganizationWithEvent();
    const volunteer = await createUser();
    await db.eventVolunteer.create({ data: { eventId: event.id, userId: volunteer.id } });

    await expect(authorization.requireEventManager(volunteer.id, event.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
