import { BadRequestError } from '../shared/errors';

/**
 * Pure global-coupon validation, mirroring
 * `backend/src/modules/coupons/coupons.service.ts`'s `evaluate()` exactly
 * — same validation order, same user-facing messages. Kept side-effect-free
 * (Firestore reads for the coupon doc + per-user usage count happen in
 * `coupons.function.ts`/`orders/orders.function.ts`) so the exact rule
 * ordering is independently unit-testable.
 */
export interface CouponEvalShape {
  type: 'PERCENTAGE' | 'FLAT';
  value: number;
  minOrderPaise: number;
  maxDiscountPaise: number | null;
  usageLimit: number | null;
  usedCount: number;
  perUserLimit: number;
  startsAt: Date;
  expiresAt: Date | null;
  isActive: boolean;
}

export interface CouponEvalInput {
  coupon: CouponEvalShape;
  subtotalPaise: number;
  userUsageCount: number;
  now?: Date;
}

export interface CouponEvalResult {
  discountPaise: number;
}

function formatRupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

export function evaluateGlobalCoupon(input: CouponEvalInput): CouponEvalResult {
  const now = input.now ?? new Date();
  const c = input.coupon;

  if (!c.isActive) throw new BadRequestError('Invalid coupon code');
  if (c.startsAt > now) throw new BadRequestError('This coupon is not active yet');
  if (c.expiresAt && c.expiresAt < now) throw new BadRequestError('This coupon has expired');
  if (input.subtotalPaise < c.minOrderPaise) {
    throw new BadRequestError(`Add items worth ₹${formatRupees(c.minOrderPaise)} to use this coupon`);
  }
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) {
    throw new BadRequestError('This coupon has reached its usage limit');
  }
  if (input.userUsageCount >= c.perUserLimit) {
    throw new BadRequestError('You have already used this coupon');
  }

  let discountPaise = c.type === 'PERCENTAGE' ? Math.round((input.subtotalPaise * c.value) / 100) : c.value;
  if (c.maxDiscountPaise !== null) {
    discountPaise = Math.min(discountPaise, c.maxDiscountPaise);
  }
  discountPaise = Math.min(discountPaise, input.subtotalPaise);

  return { discountPaise };
}
