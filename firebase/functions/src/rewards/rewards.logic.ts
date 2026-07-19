import { randomInt } from 'node:crypto';
import { AppError, BadRequestError } from '../shared/errors';

/**
 * Pure reward-spin logic, mirroring
 * `backend/src/modules/rewardspin/rewardSpin.logic.ts` and
 * `rewardSpin.service.ts` exactly (weighted selection, code generation,
 * 24h cooldown math, checkout-time validation). Kept side-effect-free —
 * `rewards.function.ts` supplies the Firestore-backed randomness source
 * (defaults to `Math.random`) and reads/writes.
 */

export interface RewardTier {
  id: string;
  cashbackAmountPaise: number;
  probability: number;
  minOrderPaise: number;
  expiryDays: number;
  isActive: boolean;
}

/** Matches the Express seed exactly (`DEFAULT_REWARD_TIERS`), in paise. Sums to 100%. */
export const DEFAULT_REWARD_TIERS: Array<Omit<RewardTier, 'id'>> = [
  { cashbackAmountPaise: 500, probability: 40, minOrderPaise: 19_900, expiryDays: 3, isActive: true },
  { cashbackAmountPaise: 1_000, probability: 25, minOrderPaise: 29_900, expiryDays: 3, isActive: true },
  { cashbackAmountPaise: 2_000, probability: 15, minOrderPaise: 49_900, expiryDays: 3, isActive: true },
  { cashbackAmountPaise: 3_000, probability: 10, minOrderPaise: 69_900, expiryDays: 3, isActive: true },
  { cashbackAmountPaise: 4_000, probability: 6, minOrderPaise: 99_900, expiryDays: 3, isActive: true },
  { cashbackAmountPaise: 5_000, probability: 4, minOrderPaise: 129_900, expiryDays: 3, isActive: true },
];

export function activeProbabilityTotal(tiers: RewardTier[]): number {
  return tiers.filter((t) => t.isActive).reduce((sum, t) => sum + t.probability, 0);
}

/** Active tiers must sum to exactly 100 for the wheel to be spinnable. */
export function validateProbabilities(tiers: RewardTier[]): void {
  if (activeProbabilityTotal(tiers) !== 100) {
    throw new AppError(
      'Reward tiers are misconfigured, please try again later',
      500,
      'REWARD_CONFIG_INVALID',
      'failed-precondition',
    );
  }
}

export function pickWeightedTier(tiers: RewardTier[], rng: () => number = Math.random): RewardTier {
  const active = tiers.filter((t) => t.isActive && t.probability > 0);
  if (active.length === 0) {
    throw new AppError('No reward tiers available', 500, 'REWARD_CONFIG_INVALID', 'failed-precondition');
  }
  const total = active.reduce((sum, t) => sum + t.probability, 0);
  let roll = rng() * total;
  for (const tier of active) {
    roll -= tier.probability;
    if (roll < 0) return tier;
  }
  // Float-rounding fallback — matches the Express `?? segments[0]` pattern.
  return active[active.length - 1];
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars: no 0/O/1/I

export function generateRewardCode(rng: () => number = Math.random): string {
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  }
  return `SPIN-${suffix}`;
}

/** Cryptographically-random variant, used by the real Function (not test-injected `Math.random`). */
export function generateRewardCodeSecure(): string {
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return `SPIN-${suffix}`;
}

export const SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Returns the next allowed spin time, or `null` if the user may spin now. */
export function computeNextSpinAt(lastSpinCreatedAt: Date | null, now: Date = new Date()): Date | null {
  if (!lastSpinCreatedAt) return null;
  const next = new Date(lastSpinCreatedAt.getTime() + SPIN_COOLDOWN_MS);
  return next > now ? next : null;
}

export interface RewardCouponEvalShape {
  userId: string;
  status: 'ACTIVE' | 'REDEEMED' | 'EXPIRED';
  expiresAt: Date;
  minOrderPaise: number;
  cashbackAmountPaise: number;
}

export interface RewardCouponEvalInput {
  rewardCoupon: RewardCouponEvalShape;
  callerUid: string;
  subtotalPaise: number;
  now?: Date;
}

export interface RewardCouponEvalResult {
  discountPaise: number;
}

function formatRupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

/** Mirrors `rewardSpin.service.ts`'s `evaluateForCheckout` exactly. */
export function evaluateRewardCoupon(input: RewardCouponEvalInput): RewardCouponEvalResult {
  const now = input.now ?? new Date();
  const rc = input.rewardCoupon;

  if (rc.userId !== input.callerUid) throw new BadRequestError('This reward coupon belongs to another account');
  if (rc.status === 'REDEEMED') throw new BadRequestError('This reward coupon has already been used');
  if (rc.status === 'EXPIRED' || rc.expiresAt < now) throw new BadRequestError('This reward coupon has expired');
  if (input.subtotalPaise < rc.minOrderPaise) {
    throw new BadRequestError(`Add items worth ₹${formatRupees(rc.minOrderPaise)} to use this reward`);
  }

  return { discountPaise: Math.min(rc.cashbackAmountPaise, input.subtotalPaise) };
}
