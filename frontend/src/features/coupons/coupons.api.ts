import { apiClient } from '../../lib/apiClient';

export interface AppliedCoupon {
  coupon: { couponId: string; code: string; type: 'PERCENTAGE' | 'FLAT'; discount: number };
  newTotal: number;
}

export const couponsApi = {
  /** Validates a coupon code against the user's current cart. */
  async apply(code: string): Promise<AppliedCoupon> {
    const { data } = await apiClient.post('/coupons/apply', { code });
    return data.data;
  },
};
