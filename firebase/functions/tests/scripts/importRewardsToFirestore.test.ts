import { describe, it, expect } from 'vitest';
import { toFirestoreRewardConfigDoc, toFirestoreRewardCouponDoc, parseArgs, type ExportedRewardConfig, type ExportedRewardCoupon } from '../../scripts/importRewardsToFirestore';

function config(overrides: Partial<ExportedRewardConfig> = {}): ExportedRewardConfig {
  return { id: 'cuid-1', cashbackAmount: '5.00', probability: 40, minOrder: '199.00', expiryDays: 3, isActive: true, sortOrder: 0, ...overrides };
}

function rewardCoupon(overrides: Partial<ExportedRewardCoupon> = {}): ExportedRewardCoupon {
  return {
    code: 'SPIN-ABCD1234',
    userId: 'user-1',
    cashbackAmount: '5.00',
    minOrder: '199.00',
    status: 'ACTIVE',
    expiresAt: '2026-07-22T00:00:00.000Z',
    redeemedOrderNumber: null,
    redeemedAt: null,
    createdAt: '2026-07-19T00:00:00.000Z',
    ...overrides,
  };
}

describe('toFirestoreRewardConfigDoc', () => {
  it('converts cashbackAmount/minOrder to paise', () => {
    const doc = toFirestoreRewardConfigDoc(config());
    expect(doc.cashbackAmountPaise).toBe(500);
    expect(doc.minOrderPaise).toBe(19900);
  });

  it('carries probability/expiryDays/isActive/sortOrder through unchanged', () => {
    const doc = toFirestoreRewardConfigDoc(config({ probability: 25, expiryDays: 7, isActive: false, sortOrder: 2 }));
    expect(doc.probability).toBe(25);
    expect(doc.expiryDays).toBe(7);
    expect(doc.isActive).toBe(false);
    expect(doc.sortOrder).toBe(2);
  });

  it('does not include the MySQL cuid id in the document body (used only as the doc ID by the caller)', () => {
    expect(toFirestoreRewardConfigDoc(config())).not.toHaveProperty('id');
  });
});

describe('toFirestoreRewardCouponDoc', () => {
  it('converts cashbackAmount/minOrder to paise', () => {
    const doc = toFirestoreRewardCouponDoc(rewardCoupon());
    expect(doc.cashbackAmountPaise).toBe(500);
    expect(doc.minOrderPaise).toBe(19900);
  });

  it('carries code/userId/status through unchanged', () => {
    const doc = toFirestoreRewardCouponDoc(rewardCoupon({ status: 'REDEEMED' }));
    expect(doc.code).toBe('SPIN-ABCD1234');
    expect(doc.userId).toBe('user-1');
    expect(doc.status).toBe('REDEEMED');
  });

  it('maps redeemedOrderNumber to redeemedOrderId, including null for an unredeemed coupon', () => {
    expect(toFirestoreRewardCouponDoc(rewardCoupon()).redeemedOrderId).toBeNull();
    expect(toFirestoreRewardCouponDoc(rewardCoupon({ redeemedOrderNumber: 'TSG-1' })).redeemedOrderId).toBe('TSG-1');
  });

  it('carries expiresAt/redeemedAt/createdAt through as ISO strings for the caller to convert', () => {
    const doc = toFirestoreRewardCouponDoc(rewardCoupon({ redeemedAt: '2026-07-19T01:00:00.000Z' }));
    expect(doc.expiresAt).toBe('2026-07-22T00:00:00.000Z');
    expect(doc.redeemedAt).toBe('2026-07-19T01:00:00.000Z');
    expect(doc.createdAt).toBe('2026-07-19T00:00:00.000Z');
  });
});

describe('parseArgs', () => {
  it('defaults execute to false (dry run)', () => {
    expect(parseArgs(['export.json'])).toEqual({ filePath: 'export.json', execute: false });
  });

  it('sets execute true only with --execute', () => {
    expect(parseArgs(['export.json', '--execute'])).toEqual({ filePath: 'export.json', execute: true });
  });

  it('throws when no file path is given', () => {
    expect(() => parseArgs([])).toThrow();
  });
});
