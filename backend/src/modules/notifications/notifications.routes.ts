import { Router } from 'express';
import { z } from 'zod';
import { notificationsService } from './notifications.service.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';

const idParam = z.object({ id: z.string().cuid() });

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const [notifications, unread] = await Promise.all([
      notificationsService.list(req.user!.id),
      notificationsService.unreadCount(req.user!.id),
    ]);
    sendSuccess(res, { notifications, unread });
  }),
);

notificationsRouter.post(
  '/:id/read',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await notificationsService.markRead(req.user!.id, req.params.id));
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    sendSuccess(res, await notificationsService.markAllRead(req.user!.id));
  }),
);
