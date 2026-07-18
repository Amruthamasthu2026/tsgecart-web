import { describe, it, expect } from 'vitest';
import {
  activeProbabilityTotal,
  validateProbabilities,
  pickWeightedTier,
  generateRewardCode,
  DEFAULT_REWARD_TIERS,
  type RewardTier,
} from '../src/modules/rewardspin/rewardSpin.logic.js';

function tier(id: string, cashback: number, prob: number, active = true): RewardTier {
  return { id, cashbackAmount: cashback, probability: prob, minOrder: 0, expiryDays: 3, isActive: active };
}

describe('activeProbabilityTotal', () => {
  it('sums only active tiers', () => {
    const tiers = [tier('a', 5, 40), tier('b', 10, 25), tier('c', 20, 35, false)];
    expect(activeProbabilityTotal(tiers)).toBe(65);
  });
});

describe('validateProbabilities', () => {
  it('passes when active tiers total exactly 100', () => {
    const tiers = [tier('a', 5, 60), tier('b', 10, 40)];
    expect(validateProbabilities(tiers)).toEqual({ ok: true, total: 100 });
  });
  it('fails when active tiers do not total 100', () => {
    const tiers = [tier('a', 5, 60), tier('b', 10, 30)];
    expect(validateProbabilities(tiers)).toEqual({ ok: false, total: 90 });
  });
});

describe('DEFAULT_REWARD_TIERS', () => {
  it('the six defaults total exactly 100%', () => {
    const total = DEFAULT_REWARD_TIERS.reduce((s, t) => s + t.probability, 0);
    expect(total).toBe(100);
    expect(DEFAULT_REWARD_TIERS).toHaveLength(6);
  });
});

describe('pickWeightedTier', () => {
  const tiers = [tier('a', 5, 40), tier('b', 10, 25), tier('c', 20, 15), tier('d', 30, 10), tier('e', 40, 6), tier('f', 50, 4)];

  it('returns the first tier for a low roll', () => {
    expect(pickWeightedTier(tiers, () => 0)?.id).toBe('a');
  });
  it('returns the last tier for a near-1 roll', () => {
    expect(pickWeightedTier(tiers, () => 0.999)?.id).toBe('f');
  });
  it('maps a mid roll to the correct cumulative bucket', () => {
    // 0.5 * 100 = 50 -> falls in tier b (40..65)
    expect(pickWeightedTier(tiers, () => 0.5)?.id).toBe('b');
  });
  it('skips inactive/zero-probability tiers', () => {
    const t = [tier('x', 5, 0), tier('y', 10, 100)];
    expect(pickWeightedTier(t, () => 0)?.id).toBe('y');
  });
  it('returns null when there are no active tiers', () => {
    expect(pickWeightedTier([tier('a', 5, 40, false)])).toBeNull();
  });
});

describe('generateRewardCode', () => {
  it('produces a unique, prefixed, uppercase code', () => {
    const a = generateRewardCode();
    const b = generateRewardCode();
    expect(a).toMatch(/^SPIN-[A-Z0-9]{8}$/);
    expect(a).not.toBe(b);
  });
});
