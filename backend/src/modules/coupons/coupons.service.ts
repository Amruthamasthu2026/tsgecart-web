import { prisma } from '../../config/prisma.js';
import { BadRequestError } from '../../shared/errors.js';

export interface CouponEvaluation {
  couponId: string;
  code: string;
  type: 'PERCENTAGE' | 'FLAT';
  discount: number;
}

export const couponsService = {
  /**
   * Validates a coupon against the user and cart subtotal, returning the
   * computed discount. Throws a BadRequestError with a user-facing reason if
   * the coupon cannot be applied.
   */
  async evaluate(code: string, userId: string, subtotal: number): Promise<CouponEvaluation> {
    const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon || !coupon.isActive) throw new BadRequestError('Invalid coupon code');

    const now = new Date();
    if (coupon.startsAt > now) throw new BadRequestError('This coupon is not active yet');
    if (coupon.expiresAt && coupon.expiresAt < now) throw new BadRequestError('This coupon has expired');

    if (subtotal < Number(coupon.minOrder)) {
      throw new BadRequestError(`Add items worth ₹${Number(coupon.minOrder)} to use this coupon`);
    }

    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestError('This coupon has reached its usage limit');
    }

    const userRedemptions = await prisma.couponRedemption.count({
      where: { couponId: coupon.id, userId },
    });
    if (userRedemptions >= coupon.perUserLimit) {
      throw new BadRequestError('You have already used this coupon');
    }

    let discount =
      coupon.type === 'PERCENTAGE'
        ? (subtotal * Number(coupon.value)) / 100
        : Number(coupon.value);

    if (coupon.maxDiscount !== null) {
      discount = Math.min(discount, Number(coupon.maxDiscount));
    }
    discount = Math.min(discount, subtotal);
    discount = Math.round(discount * 100) / 100;

    return { couponId: coupon.id, code: coupon.code, type: coupon.type, discount };
  },
};
