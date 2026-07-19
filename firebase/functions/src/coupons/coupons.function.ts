import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { db } from '../config/firebaseAdmin';
import { requireAuthenticatedCaller } from '../shared/auth';
import { parseInput } from '../shared/validation';
import { AppError, BadRequestError } from '../shared/errors';
import { evaluateGlobalCoupon, type CouponEvalShape } from './coupons.logic';
import { evaluateRewardCoupon, type RewardCouponEvalShape } from '../rewards/rewards.logic';
import type { FirestoreCouponDoc } from './coupons.types';
import type { FirestoreRewardCouponDoc } from '../rewards/rewards.types';

/**
 * Read-only coupon-code preview, migration Phase 5 — mirrors the existing
 * `POST /coupons/apply` endpoint (`coupons.service.ts`'s `evaluate()`).
 * This is a PREVIEW only: it validates and returns a discount amount but
 * never writes a `couponUsages` row or redeems a reward coupon — that only
 * happens inside the atomic order-creation transaction
 * (`orders/orders.function.ts`), exactly matching the existing Express
 * behavior where "apply" and "redeem" are two separate code paths.
 */

function toCouponEvalShape(c: FirestoreCouponDoc): CouponEvalShape {
  return {
    type: c.type,
    value: c.value,
    minOrderPaise: c.minOrderPaise,
    maxDiscountPaise: c.maxDiscountPaise,
    usageLimit: c.usageLimit,
    usedCount: c.usedCount,
    perUserLimit: c.perUserLimit,
    startsAt: c.startsAt.toDate(),
    expiresAt: c.expiresAt ? c.expiresAt.toDate() : null,
    isActive: c.isActive,
  };
}

function toRewardEvalShape(r: FirestoreRewardCouponDoc): RewardCouponEvalShape {
  return {
    userId: r.userId,
    status: r.status,
    expiresAt: r.expiresAt.toDate(),
    minOrderPaise: r.minOrderPaise,
    cashbackAmountPaise: r.cashbackAmountPaise,
  };
}

const validateCouponSchema = z.object({
  code: z.string().min(1).max(40),
  subtotalPaise: z.number().int().positive(),
});

export const validateCoupon = onCall(async (request: CallableRequest) => {
  try {
    const caller = requireAuthenticatedCaller(request);
    const { code, subtotalPaise } = parseInput(validateCouponSchema, request.data);
    const upper = code.toUpperCase();

    const couponSnap = await db.collection('coupons').doc(upper).get();
    if (couponSnap.exists) {
      const coupon = couponSnap.data() as FirestoreCouponDoc;
      const usageSnap = await db
        .collection('couponUsages')
        .where('couponCode', '==', upper)
        .where('userId', '==', caller.uid)
        .get();
      const { discountPaise } = evaluateGlobalCoupon({
        coupon: toCouponEvalShape(coupon),
        subtotalPaise,
        userUsageCount: usageSnap.size,
      });
      return { kind: 'GLOBAL' as const, code: upper, discountPaise };
    }

    const rewardSnap = await db.collection('rewardCoupons').doc(upper).get();
    if (!rewardSnap.exists) throw new BadRequestError('Invalid coupon code');
    const reward = rewardSnap.data() as FirestoreRewardCouponDoc;
    const { discountPaise } = evaluateRewardCoupon({
      rewardCoupon: toRewardEvalShape(reward),
      callerUid: caller.uid,
      subtotalPaise,
    });
    return { kind: 'REWARD' as const, code: reward.code, discountPaise };
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});
