import { Router } from 'express';
import type { Request, Response } from 'express';
import { paymentsService } from './payments.service.js';
import { verifyPaymentSchema } from '../orders/orders.validators.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.js';
import { paymentRateLimiter } from '../../middlewares/rateLimit.js';
import { BadRequestError } from '../../shared/errors.js';

export const paymentsRouter = Router();

// Verify a completed Razorpay checkout (authenticated).
paymentsRouter.post(
  '/razorpay/verify',
  authenticate,
  paymentRateLimiter,
  validate({ body: verifyPaymentSchema }),
  asyncHandler(async (req, res) => {
    const result = await paymentsService.verify(req.user!.id, req.body);
    sendSuccess(res, result);
  }),
);

// Razorpay webhook. The raw body is captured in app.ts before JSON parsing.
paymentsRouter.post(
  '/webhook',
  asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers['x-razorpay-signature'];
    if (typeof signature !== 'string') throw new BadRequestError('Missing webhook signature');
    const rawBody = req.body as Buffer;
    const result = await paymentsService.handleWebhook(rawBody, signature);
    sendSuccess(res, result);
  }),
);
