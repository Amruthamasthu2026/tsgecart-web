import { Router } from 'express';
import { z } from 'zod';
import { ordersService } from './orders.service.js';
import { paymentsService } from '../payments/payments.service.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
import { requirePermission } from '../../middlewares/rbac.js';
import { listOrdersQuery, orderIdParam, updateStatusSchema, refundSchema } from './orders.validators.js';

const adminListQuery = listOrdersQuery.extend({ search: z.string().trim().max(100).optional() });

export const adminOrdersRouter = Router();
adminOrdersRouter.use(authenticate, requirePermission('orders.manage'));

adminOrdersRouter.get(
  '/',
  validate({ query: adminListQuery }),
  asyncHandler(async (req, res) => {
    const { items, meta } = await ordersService.adminList(req.query as never);
    sendSuccess(res, { orders: items }, 200, meta);
  }),
);

adminOrdersRouter.patch(
  '/:id/status',
  validate({ params: orderIdParam, body: updateStatusSchema }),
  asyncHandler(async (req, res) => {
    const order = await ordersService.updateStatus(req.params.id, req.body.status, req.body.note);
    sendSuccess(res, { order });
  }),
);

adminOrdersRouter.post(
  '/:id/refund',
  validate({ params: orderIdParam, body: refundSchema }),
  asyncHandler(async (req, res) => {
    const result = await paymentsService.refund(req.params.id, req.body.amount);
    sendSuccess(res, result);
  }),
);
