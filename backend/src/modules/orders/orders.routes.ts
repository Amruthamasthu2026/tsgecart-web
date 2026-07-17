import { Router } from 'express';
import { ordersController } from './orders.controller.js';
import {
  createOrderSchema,
  orderIdParam,
  listOrdersQuery,
} from './orders.validators.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { authenticate } from '../../middlewares/auth.js';
import { paymentRateLimiter } from '../../middlewares/rateLimit.js';

export const ordersRouter = Router();
ordersRouter.use(authenticate);

ordersRouter.post(
  '/',
  paymentRateLimiter,
  validate({ body: createOrderSchema }),
  asyncHandler(ordersController.create),
);

ordersRouter.get('/', validate({ query: listOrdersQuery }), asyncHandler(ordersController.list));

ordersRouter.get('/:id', validate({ params: orderIdParam }), asyncHandler(ordersController.getOne));

ordersRouter.get(
  '/:id/invoice',
  validate({ params: orderIdParam }),
  asyncHandler(ordersController.invoice),
);

ordersRouter.post(
  '/:id/cancel',
  validate({ params: orderIdParam }),
  asyncHandler(ordersController.cancel),
);
