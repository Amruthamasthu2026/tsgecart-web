import { customAlphabet } from 'nanoid';

/**
 * Pure, database-free helpers for the spin-wheel reward engine. Kept
 * side-effect free so probability validation and weighted selection can be
 * unit-tested without a live database.
 */

export interface RewardTier {
  id: string;
  cashbackAmount: number;
  probability: number; // integer percentage weight
  minOrder: number;
  expiryDays: number;
  isActive: boolean;
}

/** Sum of probabilities across active tiers. */
export function activeProbabilityTotal(tiers: RewardTier[]): number {
  return tiers.filter((t) => t.isActive).reduce((sum, t) => sum + t.probability, 0);
}

/** Active tiers must total exactly 100% for the wheel to be spinnable. */
export function validateProbabilities(tiers: RewardTier[]): { ok: boolean; total: number } {
  const total = activeProbabilityTotal(tiers);
  return { ok: total === 100, total };
}

/**
 * Weighted random selection over active tiers. `rng` is injectable for
 * deterministic tests; defaults to Math.random.
 */
export function pickWeightedTier(tiers: RewardTier[], rng: () => number = Math.random): RewardTier | null {
  const active = tiers.filter((t) => t.isActive && t.probability > 0);
  if (active.length === 0) return null;
  const total = active.reduce((sum, t) => sum + t.probability, 0);
  let roll = rng() * total;
  for (const tier of active) {
    roll -= tier.probability;
    if (roll < 0) return tier;
  }
  return active[active.length - 1];
}

const codeAlphabet = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

/** Human-friendly, single-use reward coupon code (prefixed for clarity). */
export function generateRewardCode(): string {
  return `SPIN-${codeAlphabet()}`;
}

/** Default reward tiers used by the "Load defaults" admin action. */
export const DEFAULT_REWARD_TIERS: Array<Omit<RewardTier, 'id'> & { sortOrder: number }> = [
  { cashbackAmount: 5, probability: 40, minOrder: 199, expiryDays: 3, isActive: true, sortOrder: 0 },
  { cashbackAmount: 10, probability: 25, minOrder: 299, expiryDays: 3, isActive: true, sortOrder: 1 },
  { cashbackAmount: 20, probability: 15, minOrder: 499, expiryDays: 3, isActive: true, sortOrder: 2 },
  { cashbackAmount: 30, probability: 10, minOrder: 699, expiryDays: 3, isActive: true, sortOrder: 3 },
  { cashbackAmount: 40, probability: 6, minOrder: 999, expiryDays: 3, isActive: true, sortOrder: 4 },
  { cashbackAmount: 50, probability: 4, minOrder: 1299, expiryDays: 3, isActive: true, sortOrder: 5 },
];
