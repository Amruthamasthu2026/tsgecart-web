import { Router } from 'express';
import { z } from 'zod';
import { rewardSpinService } from './rewardSpin.service.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
import { requirePermission } from '../../middlewares/rbac.js';
import { paymentRateLimiter } from '../../middlewares/rateLimit.js';

const configSchema = z.object({
  cashbackAmount: z.number().min(0),
  probability: z.number().int().min(0).max(100),
  minOrder: z.number().min(0).default(0),
  expiryDays: z.number().int().min(1).max(90).default(3),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).optional(),
});
const idParam = z.object({ id: z.string().cuid() });

export const rewardSpinRouter = Router();
const manage = [authenticate, requirePermission('rewards.manage')] as const;

// ── Customer ───────────────────────────────────────────────
rewardSpinRouter.get(
  '/wheel',
  authenticate,
  asyncHandler(async (req, res) => sendSuccess(res, await rewardSpinService.getWheel(req.user!.id))),
);

rewardSpinRouter.post(
  '/spin',
  authenticate,
  paymentRateLimiter,
  asyncHandler(async (req, res) => sendSuccess(res, await rewardSpinService.spin(req.user!.id), 201)),
);

rewardSpinRouter.get(
  '/mine',
  authenticate,
  asyncHandler(async (req, res) => sendSuccess(res, { rewards: await rewardSpinService.listMyRewards(req.user!.id) })),
);

// ── Admin ──────────────────────────────────────────────────
rewardSpinRouter.get(
  '/admin/configs',
  ...manage,
  asyncHandler(async (_req, res) => sendSuccess(res, await rewardSpinService.listConfigs())),
);

rewardSpinRouter.post(
  '/admin/configs',
  ...manage,
  validate({ body: configSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, { config: await rewardSpinService.createConfig(req.body) }, 201)),
);

rewardSpinRouter.put(
  '/admin/configs/:id',
  ...manage,
  validate({ params: idParam, body: configSchema.partial() }),
  asyncHandler(async (req, res) => sendSuccess(res, { config: await rewardSpinService.updateConfig(req.params.id, req.body) })),
);

rewardSpinRouter.delete(
  '/admin/configs/:id',
  ...manage,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => sendSuccess(res, await rewardSpinService.deleteConfig(req.params.id))),
);

rewardSpinRouter.post(
  '/admin/seed-defaults',
  ...manage,
  asyncHandler(async (_req, res) => sendSuccess(res, await rewardSpinService.seedDefaults(), 201)),
);

rewardSpinRouter.get(
  '/admin/analytics',
  ...manage,
  asyncHandler(async (_req, res) => sendSuccess(res, await rewardSpinService.analytics())),
);
