import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
import { requirePermission } from '../../middlewares/rbac.js';

const createBannerSchema = z.object({
  title: z.string().trim().max(120).optional(),
  imageUrl: z.string().url(),
  linkUrl: z.string().trim().max(300).optional(),
  position: z.enum(['HOME_HERO', 'HOME_STRIP', 'CATEGORY']).default('HOME_HERO'),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
});
const updateBannerSchema = createBannerSchema.partial();
const idParam = z.object({ id: z.string().cuid() });

export const bannersRouter = Router();
const manage = [authenticate, requirePermission('banners.manage')] as const;

// Public — active banners for a position, respecting scheduling window.
bannersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const position = typeof req.query.position === 'string' ? req.query.position : undefined;
    const banners = await prisma.banner.findMany({
      where: {
        isActive: true,
        ...(position ? { position } : {}),
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: { sortOrder: 'asc' },
    });
    sendSuccess(res, { banners });
  }),
);

// Admin
bannersRouter.get(
  '/admin',
  ...manage,
  asyncHandler(async (_req, res) => {
    const banners = await prisma.banner.findMany({ orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }] });
    sendSuccess(res, { banners });
  }),
);
bannersRouter.post(
  '/',
  ...manage,
  validate({ body: createBannerSchema }),
  asyncHandler(async (req, res) => {
    const banner = await prisma.banner.create({ data: req.body });
    sendSuccess(res, { banner }, 201);
  }),
);
bannersRouter.put(
  '/:id',
  ...manage,
  validate({ params: idParam, body: updateBannerSchema }),
  asyncHandler(async (req, res) => {
    const banner = await prisma.banner.update({ where: { id: req.params.id }, data: req.body });
    sendSuccess(res, { banner });
  }),
);
bannersRouter.delete(
  '/:id',
  ...manage,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await prisma.banner.delete({ where: { id: req.params.id } });
    sendSuccess(res, { deleted: true });
  }),
);
