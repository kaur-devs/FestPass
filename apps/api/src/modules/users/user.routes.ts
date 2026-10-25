import { type RequestHandler, Router } from 'express';
import { getAuth } from '../../middleware/require-auth';
import type { UserService } from './user.service';

export function createUserRouter(users: UserService, authenticate: RequestHandler): Router {
  const router = Router();

  router.get('/me', authenticate, async (req, res) => {
    res.json({ user: await users.getCurrentUser(getAuth(req).userId) });
  });

  return router;
}
