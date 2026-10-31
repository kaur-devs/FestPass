import { type RequestHandler, Router } from 'express';
import type { EventsController } from './events.controller';

export function createEventsRouter(
  controller: EventsController,
  authenticate: RequestHandler,
): Router {
  const router = Router();

  router.get('/events', controller.listUpcoming);
  router.get('/events/:slug', controller.getPublic);
  router.get('/events/:slug/seats', controller.getPublicSeats);

  const manage = Router();
  manage.use(authenticate);
  manage.get('/organizations/:organizationId/events', controller.listForOrganization);
  manage.post('/organizations/:organizationId/events', controller.create);
  manage.get('/events/:eventId', controller.get);
  manage.patch('/events/:eventId', controller.update);
  manage.post('/events/:eventId/publish', controller.publish);
  manage.post('/events/:eventId/cancel', controller.cancel);
  manage.get('/events/:eventId/seats', controller.getSeats);
  manage.get('/events/:eventId/stats', controller.salesStats);
  manage.put('/events/:eventId/seat-map', controller.replaceSeatMap);
  manage.post('/events/:eventId/tiers', controller.addTier);
  manage.patch('/events/:eventId/tiers/:tierId', controller.updateTier);
  manage.delete('/events/:eventId/tiers/:tierId', controller.deleteTier);
  router.use('/manage', manage);

  return router;
}
