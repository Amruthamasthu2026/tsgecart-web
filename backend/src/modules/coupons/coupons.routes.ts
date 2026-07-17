import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { couponsService } from './coupons.service.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
import { requirePermission } from '../../middlewares/rbac.js';
import { cartService } from '../cart/cart.service.js';

const applySchema = z.object({ code: z.string().trim().min(1).max(40) });

const createCouponSchema = z.object({
  code: z.string().trim().toUpperCase().min(3).max(40),
  description: z.string().trim().max(200).optional(),
  type: z.enum(['PERCENTAGE', 'FLAT']),
  value: z.number().positive(),
  minOrder: z.number().min(0).default(0),
  maxDiscount: z.number().positive().optional().nullable(),
  usageLimit: z.number().int().positive().optional().nullable(),
  perUserLimit: z.number().int().min(1).default(1),
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional().nullable(),
  isActive: z.boolean().default(true),
});
const updateCouponSchema = createCouponSchema.partial();
const idParam = z.object({ id: z.string().cuid() });

export const couponsRouter = Router();
const manage = [authenticate, requirePermission('coupons.manage')] as const;

// ── Customer: apply a coupon to their current cart ───────────
couponsRouter.post(
  '/apply',
  authenticate,
  validate({ body: applySchema }),
  asyncHandler(async (req, res) => {
    const summary = await cartService.getCartSummary(req.user!.id);
    const evaluation = await couponsService.evaluate(
      req.body.code,
      req.user!.id,
      summary.subtotal,
    );
    sendSuccess(res, {
      coupon: evaluation,
      newTotal: Math.max(0, summary.subtotal - evaluation.discount) + summary.taxTotal,
    });
  }),
);

// ── Admin CRUD ───────────────────────────────────────────────
couponsRouter.get(
  '/',
  ...manage,
  asyncHandler(async (_req, res) => {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    sendSuccess(res, { coupons });
  }),
);
couponsRouter.post(
  '/',
  ...manage,
  validate({ body: createCouponSchema }),
  asyncHandler(async (req, res) => {
    const coupon = await prisma.coupon.create({ data: req.body });
    sendSuccess(res, { coupon }, 201);
  }),
);
couponsRouter.put(
  '/:id',
  ...manage,
  validate({ params: idParam, body: updateCouponSchema }),
  asyncHandler(async (req, res) => {
    const coupon = await prisma.coupon.update({ where: { id: req.params.id }, data: req.body });
    sendSuccess(res, { coupon });
  }),
);
couponsRouter.delete(
  '/:id',
  ...manage,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await prisma.coupon.delete({ where: { id: req.params.id } });
    sendSuccess(res, { deleted: true });
  }),
);
