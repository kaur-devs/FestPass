import type { AddVolunteerData, VolunteerView } from '@festpass/shared';
import { NotFoundError } from '../../lib/errors';
import type { AuthorizationService } from '../auth/authorization';
import type { CheckInRepository } from './checkin.repository';

export class VolunteersService {
  constructor(
    private readonly checkIns: CheckInRepository,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(userId: string, eventId: string): Promise<VolunteerView[]> {
    await this.authorization.requireEventManager(userId, eventId);
    const [volunteers, counts] = await Promise.all([
      this.checkIns.volunteers(eventId),
      this.checkIns.checkInsByScanner(eventId),
    ]);
    return volunteers.map((volunteer) => ({
      userId: volunteer.userId,
      name: volunteer.user.name,
      email: volunteer.user.email,
      gate: volunteer.gate,
      checkIns: counts.get(volunteer.userId) ?? 0,
    }));
  }

  async add(userId: string, eventId: string, data: AddVolunteerData): Promise<VolunteerView> {
    await this.authorization.requireEventManager(userId, eventId);
    const user = await this.checkIns.findUserByEmail(data.email);
    if (!user) {
      throw new NotFoundError('No FestPass account uses this email. Ask them to sign up first.');
    }
    const volunteer = await this.checkIns.upsertVolunteer(eventId, user.id, data.gate ?? null);
    const counts = await this.checkIns.checkInsByScanner(eventId);
    return {
      userId: volunteer.userId,
      name: volunteer.user.name,
      email: volunteer.user.email,
      gate: volunteer.gate,
      checkIns: counts.get(volunteer.userId) ?? 0,
    };
  }

  async remove(userId: string, eventId: string, volunteerId: string): Promise<void> {
    await this.authorization.requireEventManager(userId, eventId);
    await this.checkIns.removeVolunteer(eventId, volunteerId);
  }
}
