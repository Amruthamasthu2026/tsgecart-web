import { Router } from 'express';
import { z } from 'zod';
import { cartService } from './cart.service.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';

const addItemSchema = z.object({
  variantId: z.string().cuid(),
  quantity: z.number().int().min(1).max(20).default(1),
});
const updateItemSchema = z.object({ quantity: z.number().int().min(0).max(20) });
const itemIdParam = z.object({ itemId: z.string().cuid() });
const checkoutSchema = z.object({
  pincode: z.string().regex(/^\d{6}$/),
  couponCode: z.string().trim().min(1).max(40).optional(),
});

export const cartRouter = Router();
cartRouter.use(authenticate);

cartRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    sendSuccess(res, await cartService.getCart(req.user!.id));
  }),
);

cartRouter.post(
  '/items',
  validate({ body: addItemSchema }),
  asyncHandler(async (req, res) => {
    const cart = await cartService.addItem(req.user!.id, req.body.variantId, req.body.quantity);
    sendSuccess(res, cart, 201);
  }),
);

cartRouter.patch(
  '/items/:itemId',
  validate({ params: itemIdParam, body: updateItemSchema }),
  asyncHandler(async (req, res) => {
    const cart = await cartService.updateItem(req.user!.id, req.params.itemId, req.body.quantity);
    sendSuccess(res, cart);
  }),
);

cartRouter.delete(
  '/items/:itemId',
  validate({ params: itemIdParam }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await cartService.removeItem(req.user!.id, req.params.itemId));
  }),
);

cartRouter.delete(
  '/',
  asyncHandler(async (req, res) => {
    sendSuccess(res, await cartService.clear(req.user!.id));
  }),
);

cartRouter.post(
  '/checkout-summary',
  validate({ body: checkoutSchema }),
  asyncHandler(async (req, res) => {
    const result = await cartService.checkout(req.user!.id, req.body.pincode, req.body.couponCode);
    sendSuccess(res, result);
  }),
);
