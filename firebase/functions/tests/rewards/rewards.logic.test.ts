import { describe, it, expect } from 'vitest';
import {
  activeProbabilityTotal,
  validateProbabilities,
  pickWeightedTier,
  generateRewardCode,
  computeNextSpinAt,
  evaluateRewardCoupon,
  DEFAULT_REWARD_TIERS,
  SPIN_COOLDOWN_MS,
  type RewardTier,
} from '../../src/rewards/rewards.logic';
import { AppError, BadRequestError } from '../../src/shared/errors';

function tiers(overrides: Partial<RewardTier>[] = []): RewardTier[] {
  const defaults: RewardTier[] = [
    { id: 'a', cashbackAmountPaise: 500, probability: 60, minOrderPaise: 0, expiryDays: 3, isActive: true },
    { id: 'b', cashbackAmountPaise: 1000, probability: 40, minOrderPaise: 0, expiryDays: 3, isActive: true },
  ];
  return overrides.length ? (overrides as RewardTier[]) : defaults;
}

describe('DEFAULT_REWARD_TIERS', () => {
  it('matches the Express seed exactly and sums to 100%', () => {
    expect(DEFAULT_REWARD_TIERS).toHaveLength(6);
    expect(DEFAULT_REWARD_TIERS.reduce((s, t) => s + t.probability, 0)).toBe(100);
    expect(DEFAULT_REWARD_TIERS.map((t) => t.cashbackAmountPaise)).toEqual([500, 1000, 2000, 3000, 4000, 5000]);
  });
});

describe('activeProbabilityTotal / validateProbabilities', () => {
  it('sums only active tiers', () => {
    const t = tiers([
      { id: 'a', cashbackAmountPaise: 500, probability: 60, minOrderPaise: 0, expiryDays: 3, isActive: true },
      { id: 'b', cashbackAmountPaise: 1000, probability: 40, minOrderPaise: 0, expiryDays: 3, isActive: false },
    ]);
    expect(activeProbabilityTotal(t)).toBe(60);
  });

  it('does not throw when active tiers sum to exactly 100', () => {
    expect(() => validateProbabilities(tiers())).not.toThrow();
  });

  it('throws when active tiers do not sum to 100', () => {
    const t = tiers([{ id: 'a', cashbackAmountPaise: 500, probability: 50, minOrderPaise: 0, expiryDays: 3, isActive: true }]);
    expect(() => validateProbabilities(t)).toThrow(AppError);
  });
});

describe('pickWeightedTier', () => {
  it('picks the first tier when the roll lands in its range', () => {
    const result = pickWeightedTier(tiers(), () => 0.1); // roll=6, well within tier a's 0-60
    expect(result.id).toBe('a');
  });

  it('picks the second tier when the roll lands past the first tier boundary', () => {
    const result = pickWeightedTier(tiers(), () => 0.9); // roll=90, past a's 60
    expect(result.id).toBe('b');
  });

  it('ignores inactive and zero-probability tiers', () => {
    const t: RewardTier[] = [
      { id: 'inactive', cashbackAmountPaise: 500, probability: 100, minOrderPaise: 0, expiryDays: 3, isActive: false },
      { id: 'zero', cashbackAmountPaise: 500, probability: 0, minOrderPaise: 0, expiryDays: 3, isActive: true },
      { id: 'only', cashbackAmountPaise: 500, probability: 100, minOrderPaise: 0, expiryDays: 3, isActive: true },
    ];
    const result = pickWeightedTier(t, () => 0.5);
    expect(result.id).toBe('only');
  });

  it('throws when no active tiers with positive probability exist', () => {
    const t: RewardTier[] = [{ id: 'a', cashbackAmountPaise: 500, probability: 0, minOrderPaise: 0, expiryDays: 3, isActive: true }];
    expect(() => pickWeightedTier(t)).toThrow(AppError);
  });
});

describe('generateRewardCode', () => {
  it('produces an 8-character SPIN- prefixed code with no ambiguous characters in the generated suffix', () => {
    const code = generateRewardCode(() => 0.5);
    expect(code).toMatch(/^SPIN-[A-HJ-NP-Z2-9]{8}$/);
    const suffix = code.slice('SPIN-'.length);
    expect(suffix).not.toMatch(/[01OI]/);
  });
});

describe('computeNextSpinAt', () => {
  it('returns null when the user has never spun', () => {
    expect(computeNextSpinAt(null)).toBeNull();
  });

  it('returns null once 24h have elapsed since the last spin', () => {
    const last = new Date('2026-07-18T12:00:00Z');
    const now = new Date('2026-07-19T12:00:01Z');
    expect(computeNextSpinAt(last, now)).toBeNull();
  });

  it('returns the exact next-allowed time when still within cooldown', () => {
    const last = new Date('2026-07-19T10:00:00Z');
    const now = new Date('2026-07-19T12:00:00Z');
    const next = computeNextSpinAt(last, now);
    expect(next?.getTime()).toBe(last.getTime() + SPIN_COOLDOWN_MS);
  });
});

describe('evaluateRewardCoupon', () => {
  const NOW = new Date('2026-07-19T12:00:00Z');
  function baseCoupon() {
    return {
      userId: 'user-1',
      status: 'ACTIVE' as const,
      expiresAt: new Date('2026-07-25T00:00:00Z'),
      minOrderPaise: 500,
      cashbackAmountPaise: 2_000,
    };
  }

  it('computes the discount for a valid, owned, unexpired coupon', () => {
    const result = evaluateRewardCoupon({ rewardCoupon: baseCoupon(), callerUid: 'user-1', subtotalPaise: 50_000, now: NOW });
    expect(result.discountPaise).toBe(2_000);
  });

  it('caps the discount at the subtotal when the cart is smaller than the cashback amount', () => {
    const result = evaluateRewardCoupon({ rewardCoupon: baseCoupon(), callerUid: 'user-1', subtotalPaise: 1_000, now: NOW });
    expect(result.discountPaise).toBe(1_000);
  });

  it('rejects a coupon owned by another user', () => {
    expect(() =>
      evaluateRewardCoupon({ rewardCoupon: baseCoupon(), callerUid: 'someone-else', subtotalPaise: 50_000, now: NOW }),
    ).toThrow('This reward coupon belongs to another account');
  });

  it('rejects an already-redeemed coupon', () => {
    expect(() =>
      evaluateRewardCoupon({
        rewardCoupon: { ...baseCoupon(), status: 'REDEEMED' },
        callerUid: 'user-1',
        subtotalPaise: 50_000,
        now: NOW,
      }),
    ).toThrow('This reward coupon has already been used');
  });

  it('rejects a coupon past its expiresAt even if status is still ACTIVE', () => {
    expect(() =>
      evaluateRewardCoupon({
        rewardCoupon: { ...baseCoupon(), expiresAt: new Date('2020-01-01T00:00:00Z') },
        callerUid: 'user-1',
        subtotalPaise: 50_000,
        now: NOW,
      }),
    ).toThrow('This reward coupon has expired');
  });

  it('rejects when subtotal is below the coupon minOrderPaise', () => {
    expect(() =>
      evaluateRewardCoupon({ rewardCoupon: baseCoupon(), callerUid: 'user-1', subtotalPaise: 100, now: NOW }),
    ).toThrow(BadRequestError);
  });
});
