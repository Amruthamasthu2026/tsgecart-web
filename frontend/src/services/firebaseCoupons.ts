import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from '../lib/firebase';
import type { AppliedCoupon } from '../features/coupons/coupons.api';

/**
 * Firestore-backed coupon-preview service — added ALONGSIDE
 * `features/coupons/coupons.api.ts` (untouched). This is a PREVIEW only —
 * it validates a code and returns a discount amount but never redeems it;
 * redemption only happens inside the atomic `createOrder` Callable
 * (`firebase/functions/src/orders/orders.function.ts`), matching the
 * existing Express "apply vs. redeem" split exactly.
 *
 * See `VITE_USE_FIRESTORE_COUPONS` (frontend/.env.example).
 */

interface ValidateCouponResult {
  kind: 'GLOBAL' | 'REWARD';
  code: string;
  discountPaise: number;
}

const validateCouponCallable = httpsCallable<{ code: string; subtotalPaise: number }, ValidateCouponResult>(
  firebaseFunctions,
  'validateCoupon',
);

export const firebaseCouponsApi = {
  /** `subtotalRupees` — the current cart subtotal, used only for the preview; the real total is recomputed at order-creation time. */
  async validate(code: string, subtotalRupees: number): Promise<AppliedCoupon> {
    const result = await validateCouponCallable({ code, subtotalPaise: Math.round(subtotalRupees * 100) });
    return {
      coupon: { couponId: result.data.code, code: result.data.code, type: 'FLAT', discount: result.data.discountPaise / 100 },
      newTotal: subtotalRupees - result.data.discountPaise / 100,
    };
  },
};

/** True when the coupon-apply preview should validate against Firestore instead of the Express API. */
export const useFirestoreCoupons = import.meta.env.VITE_USE_FIRESTORE_COUPONS === 'true';
