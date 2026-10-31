import { type RequestHandler, Router } from 'express';
import type { RateLimiterFactory } from '../../middleware/rate-limit';
import type { CheckInController } from './checkin.controller';

export function createCheckInRouter(
  controller: CheckInController,
  authenticate: RequestHandler,
  rateLimiter: RateLimiterFactory,
): Router {
  const router = Router();
  const scanLimiter = rateLimiter('check-in-scans', { windowMs: 60 * 1000, limit: 300 });

  router.get('/check-in/events', authenticate, controller.listEvents);
  router.get('/check-in/events/:eventId/manifest', authenticate, controller.manifest);
  router.post('/check-in/events/:eventId/scans', authenticate, scanLimiter, controller.scan);

  router.get('/manage/events/:eventId/volunteers', authenticate, controller.listVolunteers);
  router.post('/manage/events/:eventId/volunteers', authenticate, controller.addVolunteer);
  router.delete(
    '/manage/events/:eventId/volunteers/:userId',
    authenticate,
    controller.removeVolunteer,
  );

  return router;
}
