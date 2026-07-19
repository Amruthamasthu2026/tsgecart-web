import type { Timestamp } from 'firebase-admin/firestore';

/**
 * Reward-coupon system — Firestore port of
 * `backend/src/modules/rewardspin/*` ("System B" in the Phase 0 audit's
 * terminology, §12). The audit records TWO coexisting reward systems in
 * the existing Express backend: the legacy `SpinWheelConfig`/`SpinHistory`
 * wallet-credit wheel ("System A", mounted at `/spin`), and this
 * coupon-issuing wheel ("System B", mounted at `/rewards-spin`). System A
 * is checkout-integration-orphaned (it credits the wallet directly and is
 * never consulted by `coupons.service.ts`'s `evaluate()`), while System B
 * is exactly what `coupons.service.ts` falls back to when a code isn't a
 * global coupon, and is what this Phase 5 spec's own tier list (₹5/10/20/
 * 30/40/50) matches verbatim. This migration therefore ports System B only
 * — System A remains Express-only/legacy, per the audit's own
 * recommendation ("this audit recommends System B as the canonical model
 * going forward"). A read-only MySQL export of System A's `SpinHistory`
 * is still produced (see `backend/scripts/exportRewardsFromMysql.ts`) so
 * no historical data is stranded, but it is not imported into Firestore.
 */
export type RewardCouponStatus = 'ACTIVE' | 'REDEEMED' | 'EXPIRED';

/** `rewardConfigs/{configId}` — auto-ID, admin-managed tiers. */
export interface FirestoreRewardConfigDoc {
  cashbackAmountPaise: number;
  /** Integer percent (0-100). Active configs' probabilities must sum to exactly 100. */
  probability: number;
  minOrderPaise: number;
  expiryDays: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** `rewardCoupons/{code}` — doc ID is the generated code itself. */
export interface FirestoreRewardCouponDoc {
  code: string;
  userId: string;
  cashbackAmountPaise: number;
  minOrderPaise: number;
  status: RewardCouponStatus;
  expiresAt: Timestamp;
  redeemedOrderId: string | null;
  redeemedAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface RewardCouponResponse
  extends Omit<FirestoreRewardCouponDoc, 'expiresAt' | 'redeemedAt' | 'createdAt'> {
  id: string;
  expiresAt: string;
  redeemedAt: string | null;
  createdAt: string;
}

/** The wheel shape served to a signed-in customer — probability is never exposed. */
export interface RewardWheelTier {
  id: string;
  cashbackAmountPaise: number;
  minOrderPaise: number;
  expiryDays: number;
}

export interface RewardWheelResponse {
  tiers: RewardWheelTier[];
  canSpin: boolean;
  nextSpinAt: string | null;
}
