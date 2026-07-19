import { httpsCallable } from 'firebase/functions';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { firebaseFunctions, firebaseFirestore } from '../lib/firebase';
import type { WheelState, SpinReward, RewardCoupon } from '../features/rewards/spin.api';

/**
 * Firestore-backed reward-spin service — added ALONGSIDE
 * `features/rewards/spin.api.ts` (untouched; System B, the coupon-issuing
 * wheel — see firebase/functions/src/rewards/rewards.types.ts for why the
 * legacy wallet-credit wheel, System A, is not ported). `getRewardWheel` is
 * a Callable (never a direct `rewardConfigs` read) because tier
 * `probability` must never reach a customer's browser — Security Rules
 * cannot redact individual fields on a read, so the Callable strips it
 * server-side. `spinReward` is a Callable because the 24h-cooldown check +
 * weighted selection + code generation must happen inside one Firestore
 * transaction. Listing a user's own reward coupons IS a direct Firestore
 * read (owner-only Security Rule, no cross-document invariant to protect).
 *
 * See `VITE_USE_FIRESTORE_REWARDS` (frontend/.env.example).
 */

interface FirestoreRewardWheelResponse {
  tiers: Array<{ id: string; cashbackAmountPaise: number; minOrderPaise: number; expiryDays: number }>;
  canSpin: boolean;
  nextSpinAt: string | null;
}

interface FirestoreRewardCouponResponse {
  code: string;
  cashbackAmountPaise: number;
  minOrderPaise: number;
  status: 'ACTIVE' | 'REDEEMED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
}

interface FirestoreSpinResult {
  coupon: FirestoreRewardCouponResponse & { id: string };
}

const getRewardWheelCallable = httpsCallable<undefined, FirestoreRewardWheelResponse>(firebaseFunctions, 'getRewardWheel');
const spinRewardCallable = httpsCallable<undefined, FirestoreSpinResult>(firebaseFunctions, 'spinReward');

function paiseToRupees(paise: number): number {
  return paise / 100;
}

function toLegacyWheel(fsWheel: FirestoreRewardWheelResponse): WheelState {
  return {
    tiers: fsWheel.tiers.map((t) => ({ id: t.id, cashbackAmount: paiseToRupees(t.cashbackAmountPaise), minOrder: paiseToRupees(t.minOrderPaise) })),
    canSpin: fsWheel.canSpin,
    isConfigured: fsWheel.tiers.length > 0,
    activeProbabilityTotal: 100, // never exposed by the Callable — assumed valid, matches what a customer needs to know (server already validated it)
    nextSpinAt: fsWheel.nextSpinAt,
  };
}

function toLegacyRewardCoupon(id: string, c: FirestoreRewardCouponResponse): RewardCoupon {
  return {
    id,
    code: c.code,
    cashbackAmount: paiseToRupees(c.cashbackAmountPaise),
    minOrder: paiseToRupees(c.minOrderPaise),
    status: c.status,
    expiresAt: c.expiresAt,
    createdAt: c.createdAt,
  };
}

export const firebaseRewardsApi = {
  async wheel(): Promise<WheelState> {
    const result = await getRewardWheelCallable();
    return toLegacyWheel(result.data);
  },

  async spin(): Promise<SpinReward> {
    const result = await spinRewardCallable();
    const c = result.data.coupon;
    return { code: c.code, cashbackAmount: paiseToRupees(c.cashbackAmountPaise), minOrder: paiseToRupees(c.minOrderPaise), expiresAt: c.expiresAt };
  },

  async myRewards(uid: string): Promise<RewardCoupon[]> {
    const snap = await getDocs(
      query(collection(firebaseFirestore, 'rewardCoupons'), where('userId', '==', uid), orderBy('createdAt', 'desc')),
    );
    return snap.docs.map((d) => toLegacyRewardCoupon(d.id, d.data() as FirestoreRewardCouponResponse));
  },
};

/** True when the reward-spin wheel should read/write Firestore instead of the Express API. */
export const useFirestoreRewards = import.meta.env.VITE_USE_FIRESTORE_REWARDS === 'true';
