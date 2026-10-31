import { createEventSchema, seatMapSchema, tierSchema, updateEventSchema } from '@festpass/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { parseBody, parseIdParam, parseQuery, readParam } from '../../lib/validation';
import { getAuth } from '../../middleware/require-auth';
import type { EventCatalogService } from './event-catalog.service';
import type { EventManagementService } from './event-management.service';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(12),
  cursor: z.string().max(500).optional(),
});

export class EventsController {
  constructor(
    private readonly catalog: EventCatalogService,
    private readonly management: EventManagementService,
  ) {}

  listUpcoming: RequestHandler = async (req, res) => {
    res.json(await this.catalog.listUpcoming(parseQuery(listQuerySchema, req)));
  };

  getPublic: RequestHandler = async (req, res) => {
    res.json({ event: await this.catalog.getBySlug(readParam(req, 'slug')) });
  };

  getPublicSeats: RequestHandler = async (req, res) => {
    res.json({ seats: await this.catalog.getSeats(readParam(req, 'slug')) });
  };

  listForOrganization: RequestHandler = async (req, res) => {
    const events = await this.management.listForOrganization(
      getAuth(req).userId,
      parseIdParam(req, 'organizationId'),
    );
    res.json({ events });
  };

  create: RequestHandler = async (req, res) => {
    const event = await this.management.create(
      getAuth(req).userId,
      parseIdParam(req, 'organizationId'),
      parseBody(createEventSchema, req),
    );
    res.status(201).json({ event });
  };

  get: RequestHandler = async (req, res) => {
    res.json({
      event: await this.management.get(getAuth(req).userId, parseIdParam(req, 'eventId')),
    });
  };

  update: RequestHandler = async (req, res) => {
    const event = await this.management.update(
      getAuth(req).userId,
      parseIdParam(req, 'eventId'),
      parseBody(updateEventSchema, req),
    );
    res.json({ event });
  };

  publish: RequestHandler = async (req, res) => {
    res.json({
      event: await this.management.publish(getAuth(req).userId, parseIdParam(req, 'eventId')),
    });
  };

  cancel: RequestHandler = async (req, res) => {
    res.json({
      event: await this.management.cancel(getAuth(req).userId, parseIdParam(req, 'eventId')),
    });
  };

  salesStats: RequestHandler = async (req, res) => {
    const stats = await this.management.salesStats(
      getAuth(req).userId,
      parseIdParam(req, 'eventId'),
    );
    res.json({ stats });
  };

  getSeats: RequestHandler = async (req, res) => {
    const eventId = parseIdParam(req, 'eventId');
    await this.management.get(getAuth(req).userId, eventId);
    res.json({ seats: await this.catalog.seatViews(eventId) });
  };

  addTier: RequestHandler = async (req, res) => {
    const tier = await this.management.addTier(
      getAuth(req).userId,
      parseIdParam(req, 'eventId'),
      parseBody(tierSchema, req),
    );
    res.status(201).json({ tier });
  };

  updateTier: RequestHandler = async (req, res) => {
    const tier = await this.management.updateTier(
      getAuth(req).userId,
      parseIdParam(req, 'eventId'),
      parseIdParam(req, 'tierId'),
      parseBody(tierSchema, req),
    );
    res.json({ tier });
  };

  deleteTier: RequestHandler = async (req, res) => {
    await this.management.deleteTier(
      getAuth(req).userId,
      parseIdParam(req, 'eventId'),
      parseIdParam(req, 'tierId'),
    );
    res.status(204).end();
  };

  replaceSeatMap: RequestHandler = async (req, res) => {
    const event = await this.management.replaceSeatMap(
      getAuth(req).userId,
      parseIdParam(req, 'eventId'),
      parseBody(seatMapSchema, req),
    );
    res.json({ event });
  };
}
