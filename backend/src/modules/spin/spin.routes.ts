import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { spinService } from './spin.service.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
import { requirePermission } from '../../middlewares/rbac.js';
import { paymentRateLimiter } from '../../middlewares/rateLimit.js';

const segmentSchema = z.object({
  label: z.string().trim().min(1).max(60),
  rewardAmount: z.number().min(0),
  weight: z.number().int().min(1).max(1000),
  color: z.string().trim().max(20).optional(),
  isActive: z.boolean().default(true),
});
const idParam = z.object({ id: z.string().cuid() });

export const spinRouter = Router();

// ── Customer ─────────────────────────────────────────────────
spinRouter.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const config = await spinService.getActiveConfig();
    const nextSpinAt = config
      ? await spinService.nextSpinAt(req.user!.id, config.cooldownHours)
      : null;
    sendSuccess(res, {
      config: config
        ? {
            id: config.id,
            name: config.name,
            cooldownHours: config.cooldownHours,
            segments: config.segments.map((s) => ({
              id: s.id,
              label: s.label,
              rewardAmount: Number(s.rewardAmount),
              color: s.color,
            })),
          }
        : null,
      canSpin: !nextSpinAt,
      nextSpinAt,
    });
  }),
);

spinRouter.post(
  '/spin',
  authenticate,
  paymentRateLimiter,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await spinService.spin(req.user!.id));
  }),
);

// ── Admin: segment management ────────────────────────────────
const manage = [authenticate, requirePermission('rewards.manage')] as const;

spinRouter.post(
  '/admin/segments',
  ...manage,
  validate({ body: segmentSchema }),
  asyncHandler(async (req, res) => {
    const config = await spinService.getActiveConfig();
    if (!config) {
      const created = await prisma.spinWheelConfig.create({ data: { name: 'Default Wheel' } });
      const segment = await prisma.spinSegment.create({
        data: { ...req.body, configId: created.id },
      });
      sendSuccess(res, { segment }, 201);
      return;
    }
    const segment = await prisma.spinSegment.create({ data: { ...req.body, configId: config.id } });
    sendSuccess(res, { segment }, 201);
  }),
);

spinRouter.put(
  '/admin/segments/:id',
  ...manage,
  validate({ params: idParam, body: segmentSchema.partial() }),
  asyncHandler(async (req, res) => {
    const segment = await prisma.spinSegment.update({ where: { id: req.params.id }, data: req.body });
    sendSuccess(res, { segment });
  }),
);

spinRouter.delete(
  '/admin/segments/:id',
  ...manage,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await prisma.spinSegment.delete({ where: { id: req.params.id } });
    sendSuccess(res, { deleted: true });
  }),
);
