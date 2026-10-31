import { addVolunteerSchema, scanBatchSchema } from '@festpass/shared';
import type { RequestHandler } from 'express';
import { parseBody, parseIdParam } from '../../lib/validation';
import { getAuth } from '../../middleware/require-auth';
import type { CheckInService } from './checkin.service';
import type { VolunteersService } from './volunteers.service';

export class CheckInController {
  constructor(
    private readonly checkIns: CheckInService,
    private readonly volunteers: VolunteersService,
  ) {}

  listEvents: RequestHandler = async (req, res) => {
    res.json({ events: await this.checkIns.listEvents(getAuth(req).userId) });
  };

  manifest: RequestHandler = async (req, res) => {
    const manifest = await this.checkIns.manifest(
      getAuth(req).userId,
      parseIdParam(req, 'eventId'),
    );
    res.set('Cache-Control', 'private, no-store').json({ manifest });
  };

  scan: RequestHandler = async (req, res) => {
    const results = await this.checkIns.scan(
      getAuth(req).userId,
      parseIdParam(req, 'eventId'),
      parseBody(scanBatchSchema, req),
    );
    res.json({ results });
  };

  listVolunteers: RequestHandler = async (req, res) => {
    const volunteers = await this.volunteers.list(
      getAuth(req).userId,
      parseIdParam(req, 'eventId'),
    );
    res.json({ volunteers });
  };

  addVolunteer: RequestHandler = async (req, res) => {
    const volunteer = await this.volunteers.add(
      getAuth(req).userId,
      parseIdParam(req, 'eventId'),
      parseBody(addVolunteerSchema, req),
    );
    res.status(201).json({ volunteer });
  };

  removeVolunteer: RequestHandler = async (req, res) => {
    await this.volunteers.remove(
      getAuth(req).userId,
      parseIdParam(req, 'eventId'),
      parseIdParam(req, 'userId'),
    );
    res.status(204).end();
  };
}
