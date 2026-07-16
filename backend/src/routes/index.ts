import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { redis } from '../config/redis.js';
import { asyncHandler } from '../shared/asyncHandler.js';
import { sendSuccess } from '../shared/apiResponse.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';

/**
 * Root API router. Feature module routers are mounted here as each phase
 * is implemented (auth, catalog, cart, orders, admin, …).
 */
export const apiRouter = Router();

apiRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const [dbOk, redisOk] = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      redis.ping(),
    ]);
    sendSuccess(res, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk.status === 'fulfilled' ? 'up' : 'down',
        redis: redisOk.status === 'fulfilled' ? 'up' : 'down',
      },
    });
  }),
);

// Feature modules
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
