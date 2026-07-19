import { describe, it, expect } from 'vitest';
import { toExportedRewardConfig, toExportedRewardCoupon, toExportedLegacySpinHistory } from '../../scripts/exportRewardsFromMysql.js';

describe('toExportedRewardConfig', () => {
  it('stringifies Decimal fields and carries the id through', () => {
    const result = toExportedRewardConfig({
      id: 'cuid-1',
      cashbackAmount: { toString: () => '5.00' },
      probability: 40,
      minOrder: { toString: () => '199.00' },
      expiryDays: 3,
      isActive: true,
      sortOrder: 0,
    });
    expect(result).toEqual({ id: 'cuid-1', cashbackAmount: '5.00', probability: 40, minOrder: '199.00', expiryDays: 3, isActive: true, sortOrder: 0 });
  });
});

describe('toExportedRewardCoupon', () => {
  const base = {
    code: 'SPIN-ABCD1234',
    userId: 'user-1',
    cashbackAmount: { toString: () => '5.00' },
    minOrder: { toString: () => '199.00' },
    status: 'ACTIVE',
    expiresAt: new Date('2026-07-22T00:00:00Z'),
    redeemedOrderNumber: null,
    redeemedAt: null,
    createdAt: new Date('2026-07-19T00:00:00Z'),
  };

  it('stringifies Decimal fields and converts dates to ISO', () => {
    const result = toExportedRewardCoupon(base);
    expect(result.cashbackAmount).toBe('5.00');
    expect(result.expiresAt).toBe('2026-07-22T00:00:00.000Z');
    expect(result.createdAt).toBe('2026-07-19T00:00:00.000Z');
  });

  it('carries the resolved redeemedOrderNumber through (not the raw MySQL order id)', () => {
    const result = toExportedRewardCoupon({ ...base, status: 'REDEEMED', redeemedOrderNumber: 'TSG-260719-00000001', redeemedAt: new Date('2026-07-19T01:00:00Z') });
    expect(result.redeemedOrderNumber).toBe('TSG-260719-00000001');
    expect(result.redeemedAt).toBe('2026-07-19T01:00:00.000Z');
  });

  it('carries null redeemedOrderNumber/redeemedAt through for an unredeemed coupon', () => {
    const result = toExportedRewardCoupon(base);
    expect(result.redeemedOrderNumber).toBeNull();
    expect(result.redeemedAt).toBeNull();
  });
});

describe('toExportedLegacySpinHistory', () => {
  it('stringifies rewardAmount and converts createdAt to ISO', () => {
    const result = toExportedLegacySpinHistory({
      userId: 'user-1',
      segmentLabel: '₹10 Cashback',
      rewardAmount: { toString: () => '10.00' },
      createdAt: new Date('2026-07-19T00:00:00Z'),
    });
    expect(result).toEqual({ userId: 'user-1', segmentLabel: '₹10 Cashback', rewardAmount: '10.00', createdAt: '2026-07-19T00:00:00.000Z' });
  });
});
