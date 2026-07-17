import { Router } from 'express';
import { z } from 'zod';
import { reviewsService } from './reviews.service.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
import { requirePermission } from '../../middlewares/rbac.js';

const createReviewSchema = z.object({
  productId: z.string().cuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  comment: z.string().trim().max(1000).optional(),
});
const idParam = z.object({ id: z.string().cuid() });
const approveSchema = z.object({ isApproved: z.boolean() });

export const reviewsRouter = Router();

// Customer
reviewsRouter.post(
  '/',
  authenticate,
  validate({ body: createReviewSchema }),
  asyncHandler(async (req, res) => {
    const review = await reviewsService.create(req.user!.id, req.body.productId, req.body);
    sendSuccess(res, { review }, 201);
  }),
);

reviewsRouter.get(
  '/mine',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, { reviews: await reviewsService.listMine(req.user!.id) });
  }),
);

// Admin moderation
const manage = [authenticate, requirePermission('reviews.manage')] as const;

reviewsRouter.get(
  '/admin',
  ...manage,
  asyncHandler(async (req, res) => {
    const approved =
      req.query.approved === 'true' ? true : req.query.approved === 'false' ? false : undefined;
    sendSuccess(res, { reviews: await reviewsService.adminList(approved) });
  }),
);

reviewsRouter.patch(
  '/admin/:id',
  ...manage,
  validate({ params: idParam, body: approveSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await reviewsService.setApproval(req.params.id, req.body.isApproved));
  }),
);

reviewsRouter.delete(
  '/admin/:id',
  ...manage,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await reviewsService.remove(req.params.id));
  }),
);
