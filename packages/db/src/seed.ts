import { randomUUID } from 'node:crypto';
import { createPrismaClient } from './client';
import {
  EventStatus,
  OrderStatus,
  OrganizationRole,
  PlatformRole,
  type Prisma,
  type PrismaClient,
  SeatingType,
} from './generated/prisma/client';

const IST_OFFSET_MINUTES = 330;

const DEV_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$Ory2UrlDEMzj75KqhPB3tQ$gkRiT9dxslxIZ9+Ynkwmd8rRJS4+VmVgMV52R6fr2JU';

function istDate(daysFromNow: number, hour: number, minute = 0): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  date.setUTCHours(hour, minute, 0, 0);
  return new Date(date.getTime() - IST_OFFSET_MINUTES * 60_000);
}

async function reset(db: PrismaClient) {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  const list = tables.map(({ tablename }) => `"${tablename}"`).join(', ');
  await db.$executeRawUnsafe(`TRUNCATE ${list} CASCADE`);
}

async function seedUsers(db: PrismaClient) {
  const people = [
    { key: 'admin', name: 'Platform Admin', role: PlatformRole.ADMIN },
    { key: 'riya', name: 'Riya Sharma' },
    { key: 'arjun', name: 'Arjun Menon' },
    { key: 'kabir', name: 'Kabir Singh' },
    { key: 'meera', name: 'Meera Iyer' },
    { key: 'ananya', name: 'Ananya Gupta' },
    { key: 'rohan', name: 'Rohan Das' },
    { key: 'sana', name: 'Sana Qureshi' },
    { key: 'vikram', name: 'Vikram Rao' },
  ] as const;

  const entries = await Promise.all(
    people.map(async (person) => {
      const user = await db.user.create({
        data: {
          email: `${person.key}@festpass.test`,
          name: person.name,
          role: 'role' in person ? person.role : PlatformRole.USER,
          passwordHash: DEV_PASSWORD_HASH,
          emailVerifiedAt: new Date(),
        },
      });
      return [person.key, user.id] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<(typeof people)[number]['key'], string>;
}

type SeededUsers = Awaited<ReturnType<typeof seedUsers>>;

async function seedOrganizations(db: PrismaClient, users: SeededUsers) {
  const festCommittee = await db.organization.create({
    data: {
      name: 'Utsav Fest Committee',
      slug: 'utsav-fest-committee',
      members: {
        create: [
          { userId: users.riya, role: OrganizationRole.OWNER },
          { userId: users.arjun, role: OrganizationRole.ORGANIZER },
        ],
      },
    },
  });

  const roboticsClub = await db.organization.create({
    data: {
      name: 'Robotics and Coding Club',
      slug: 'robotics-coding-club',
      members: { create: [{ userId: users.arjun, role: OrganizationRole.OWNER }] },
    },
  });

  return { festCommittee: festCommittee.id, roboticsClub: roboticsClub.id };
}

type SeededOrganizations = Awaited<ReturnType<typeof seedOrganizations>>;

const AUDITORIUM_SECTIONS = [
  { name: 'Left', seatsPerRow: 8, xOffset: 0 },
  { name: 'Centre', seatsPerRow: 14, xOffset: 10 },
  { name: 'Right', seatsPerRow: 8, xOffset: 26 },
] as const;

const AUDITORIUM_ROWS = 'ABCDEFGHIJKL'.split('');

function auditoriumSeats(eventId: string, tierForRow: (row: string) => string) {
  return AUDITORIUM_SECTIONS.flatMap((section) =>
    AUDITORIUM_ROWS.flatMap((row, rowIndex) =>
      Array.from({ length: section.seatsPerRow }, (_, i): Prisma.SeatCreateManyInput => ({
        eventId,
        tierId: tierForRow(row),
        section: section.name,
        row,
        number: i + 1,
        x: section.xOffset + i,
        y: rowIndex,
        isAccessible: row === 'L' && section.name === 'Centre' && i < 2,
      })),
    ),
  );
}

async function seedProNight(db: PrismaClient, organizationId: string) {
  const event = await db.event.create({
    data: {
      organizationId,
      slug: 'utsav-2027-pro-night',
      title: 'Utsav 2027: Pro Night',
      description:
        'The closing night of Utsav, with a live headline act on the main stage. Reserved seating; doors open 45 minutes before the show.',
      venue: 'Main Auditorium',
      startsAt: istDate(30, 19, 0),
      endsAt: istDate(30, 22, 30),
      salesStartAt: istDate(-3, 10, 0),
      salesEndAt: istDate(30, 17, 0),
      status: EventStatus.PUBLISHED,
      seatingType: SeatingType.RESERVED,
    },
  });

  const [platinum, gold, silver] = await Promise.all([
    db.ticketTier.create({
      data: {
        eventId: event.id,
        name: 'Platinum',
        priceInPaise: 79_900,
        maxPerOrder: 4,
        sortOrder: 0,
      },
    }),
    db.ticketTier.create({
      data: { eventId: event.id, name: 'Gold', priceInPaise: 49_900, maxPerOrder: 6, sortOrder: 1 },
    }),
    db.ticketTier.create({
      data: {
        eventId: event.id,
        name: 'Silver',
        priceInPaise: 29_900,
        maxPerOrder: 6,
        sortOrder: 2,
      },
    }),
  ]);

  const tierForRow = (row: string) => {
    if (row <= 'C') return platinum.id;
    if (row <= 'H') return gold.id;
    return silver.id;
  };
  await db.seat.createMany({ data: auditoriumSeats(event.id, tierForRow) });

  return { eventId: event.id, platinumId: platinum.id, goldId: gold.id };
}

async function seedGeneralAdmissionEvents(db: PrismaClient, orgs: SeededOrganizations) {
  const bands = await db.event.create({
    data: {
      organizationId: orgs.festCommittee,
      slug: 'utsav-2027-battle-of-the-bands',
      title: 'Battle of the Bands',
      description: 'Twelve college bands, one stage, one trophy. Standing area; entry until 7 PM.',
      venue: 'Open Air Theatre',
      startsAt: istDate(29, 17, 30),
      endsAt: istDate(29, 22, 0),
      salesStartAt: istDate(-5, 10, 0),
      salesEndAt: istDate(29, 16, 0),
      status: EventStatus.PUBLISHED,
      seatingType: SeatingType.GENERAL_ADMISSION,
      tiers: {
        create: [
          { name: 'Early bird', priceInPaise: 14_900, capacity: 200, maxPerOrder: 4, sortOrder: 0 },
          { name: 'Regular', priceInPaise: 24_900, capacity: 600, maxPerOrder: 6, sortOrder: 1 },
        ],
      },
    },
    include: { tiers: true },
  });

  await db.event.create({
    data: {
      organizationId: orgs.roboticsClub,
      slug: 'hackriverside-2027',
      title: 'HackRiverside: 24-hour Hackathon',
      description:
        'Build anything in 24 hours. Teams of up to four, meals included. Every participant needs their own pass.',
      venue: 'Innovation Centre, Block C',
      startsAt: istDate(21, 9, 0),
      endsAt: istDate(22, 9, 0),
      salesStartAt: istDate(-10, 10, 0),
      salesEndAt: istDate(18, 23, 59),
      status: EventStatus.PUBLISHED,
      seatingType: SeatingType.GENERAL_ADMISSION,
      tiers: {
        create: [{ name: 'Participant', priceInPaise: 0, capacity: 150, maxPerOrder: 1 }],
      },
    },
  });

  await db.event.create({
    data: {
      organizationId: orgs.festCommittee,
      slug: 'utsav-2027-fashion-show',
      title: 'Utsav 2027: Fashion Show',
      venue: 'Main Auditorium',
      startsAt: istDate(29, 19, 0),
      endsAt: istDate(29, 21, 0),
      salesStartAt: istDate(7, 10, 0),
      salesEndAt: istDate(29, 17, 0),
      status: EventStatus.DRAFT,
      seatingType: SeatingType.GENERAL_ADMISSION,
      tiers: { create: [{ name: 'General', priceInPaise: 19_900, capacity: 300 }] },
    },
  });

  const earlyBird = bands.tiers.find((tier) => tier.name === 'Early bird');
  if (!earlyBird) throw new Error('Early bird tier missing');
  return { bandsEventId: bands.id, earlyBirdId: earlyBird.id };
}

async function seedPastEvent(db: PrismaClient, organizationId: string, users: SeededUsers) {
  const event = await db.event.create({
    data: {
      organizationId,
      slug: 'freshers-night-2026',
      title: "Freshers' Night 2026",
      description: 'Welcome night for the incoming batch.',
      venue: 'Open Air Theatre',
      startsAt: istDate(-60, 18, 0),
      endsAt: istDate(-60, 22, 0),
      salesStartAt: istDate(-75, 10, 0),
      salesEndAt: istDate(-60, 16, 0),
      status: EventStatus.PUBLISHED,
      seatingType: SeatingType.GENERAL_ADMISSION,
      volunteers: { create: [{ userId: users.kabir, gate: 'Gate 1' }] },
    },
  });

  const tier = await db.ticketTier.create({
    data: { eventId: event.id, name: 'Entry', priceInPaise: 9_900, capacity: 400, soldCount: 3 },
  });

  const attendees = [users.ananya, users.rohan, users.sana];
  for (const [index, userId] of attendees.entries()) {
    const paidAt = istDate(-70 + index, 12, 15);
    const order = await db.order.create({
      data: {
        userId,
        eventId: event.id,
        status: OrderStatus.PAID,
        totalInPaise: tier.priceInPaise,
        idempotencyKey: randomUUID(),
        razorpayOrderId: `order_seed_past_${index}`,
        razorpayPaymentId: `pay_seed_past_${index}`,
        expiresAt: new Date(paidAt.getTime() + 10 * 60_000),
        paidAt,
        items: { create: { tierId: tier.id, quantity: 1, unitPriceInPaise: tier.priceInPaise } },
      },
    });
    const ticket = await db.ticket.create({
      data: {
        orderId: order.id,
        eventId: event.id,
        tierId: tier.id,
        holderId: userId,
        issuedAt: paidAt,
      },
    });
    if (index < 2) {
      await db.checkIn.create({
        data: {
          ticketId: ticket.id,
          eventId: event.id,
          scannedById: users.kabir,
          gate: 'Gate 1',
          createdAt: istDate(-60, 18, 10 + index * 7),
        },
      });
    }
  }
}

async function seedProNightBooking(
  db: PrismaClient,
  proNight: Awaited<ReturnType<typeof seedProNight>>,
  users: SeededUsers,
) {
  await db.eventVolunteer.createMany({
    data: [
      { eventId: proNight.eventId, userId: users.kabir, gate: 'Gate 1' },
      { eventId: proNight.eventId, userId: users.meera, gate: 'Gate 2' },
    ],
  });

  const seats = await db.seat.findMany({
    where: { eventId: proNight.eventId, section: 'Centre', row: 'B', number: { in: [7, 8] } },
  });
  const paidAt = istDate(-1, 20, 42);

  const order = await db.order.create({
    data: {
      userId: users.vikram,
      eventId: proNight.eventId,
      status: OrderStatus.PAID,
      totalInPaise: 79_900 * seats.length,
      idempotencyKey: randomUUID(),
      razorpayOrderId: 'order_seed_pro_night_0',
      razorpayPaymentId: 'pay_seed_pro_night_0',
      expiresAt: new Date(paidAt.getTime() + 5 * 60_000),
      paidAt,
      items: {
        create: seats.map((seat) => ({
          tierId: proNight.platinumId,
          seatId: seat.id,
          unitPriceInPaise: 79_900,
        })),
      },
    },
  });

  await db.ticket.createMany({
    data: seats.map((seat) => ({
      orderId: order.id,
      eventId: proNight.eventId,
      tierId: proNight.platinumId,
      seatId: seat.id,
      holderId: users.vikram,
      issuedAt: paidAt,
    })),
  });

  await db.ticketTier.update({
    where: { id: proNight.platinumId },
    data: { soldCount: { increment: seats.length } },
  });
}

async function seedPendingOrder(
  db: PrismaClient,
  bands: Awaited<ReturnType<typeof seedGeneralAdmissionEvents>>,
  userId: string,
) {
  await db.order.create({
    data: {
      userId,
      eventId: bands.bandsEventId,
      totalInPaise: 14_900 * 2,
      idempotencyKey: randomUUID(),
      expiresAt: new Date(Date.now() + 5 * 60_000),
      items: { create: { tierId: bands.earlyBirdId, quantity: 2, unitPriceInPaise: 14_900 } },
    },
  });
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database');
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const db = createPrismaClient(url);
  try {
    await reset(db);
    const users = await seedUsers(db);
    const orgs = await seedOrganizations(db, users);
    const proNight = await seedProNight(db, orgs.festCommittee);
    const bands = await seedGeneralAdmissionEvents(db, orgs);
    await seedProNightBooking(db, proNight, users);
    await seedPendingOrder(db, bands, users.ananya);
    await seedPastEvent(db, orgs.festCommittee, users);

    const [events, seats, tickets] = await Promise.all([
      db.event.count(),
      db.seat.count(),
      db.ticket.count(),
    ]);
    process.stdout.write(`Seeded ${events} events, ${seats} seats, ${tickets} tickets\n`);
  } finally {
    await db.$disconnect();
  }
}

await main();
