import { Router } from 'express';
import { walletService } from '../wallet/wallet.service.js';
import { referralService } from '../referral/referral.service.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { authenticate } from '../../middlewares/auth.js';

export const rewardsRouter = Router();
rewardsRouter.use(authenticate);

rewardsRouter.get(
  '/wallet',
  asyncHandler(async (req, res) => {
    const [balance, transactions] = await Promise.all([
      walletService.getBalance(req.user!.id),
      walletService.getTransactions(req.user!.id),
    ]);
    sendSuccess(res, { balance, transactions });
  }),
);

rewardsRouter.get(
  '/referral',
  asyncHandler(async (req, res) => {
    sendSuccess(res, await referralService.getSummary(req.user!.id));
  }),
);
