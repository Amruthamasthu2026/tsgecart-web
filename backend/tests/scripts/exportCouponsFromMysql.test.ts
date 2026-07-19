import { describe, it, expect } from 'vitest';
import { toExportedCoupon, toExportedCouponUsage } from '../../scripts/exportCouponsFromMysql.js';

const baseCoupon = {
  code: 'SAVE10',
  description: '10% off',
  type: 'PERCENTAGE',
  value: { toString: () => '10.00' },
  minOrder: { toString: () => '199.00' },
  maxDiscount: { toString: () => '100.00' },
  usageLimit: 500,
  perUserLimit: 1,
  usedCount: 12,
  startsAt: new Date('2026-01-01T00:00:00Z'),
  expiresAt: new Date('2026-12-31T00:00:00Z'),
  isActive: true,
};

describe('toExportedCoupon', () => {
  it('stringifies Decimal fields', () => {
    const result = toExportedCoupon(baseCoupon);
    expect(result.value).toBe('10.00');
    expect(result.minOrder).toBe('199.00');
    expect(result.maxDiscount).toBe('100.00');
  });

  it('carries a null maxDiscount through as null', () => {
    expect(toExportedCoupon({ ...baseCoupon, maxDiscount: null }).maxDiscount).toBeNull();
  });

  it('carries a null usageLimit through as null (unlimited)', () => {
    expect(toExportedCoupon({ ...baseCoupon, usageLimit: null }).usageLimit).toBeNull();
  });

  it('converts startsAt/expiresAt to ISO strings, and null expiresAt stays null', () => {
    const result = toExportedCoupon(baseCoupon);
    expect(result.startsAt).toBe('2026-01-01T00:00:00.000Z');
    expect(result.expiresAt).toBe('2026-12-31T00:00:00.000Z');
    expect(toExportedCoupon({ ...baseCoupon, expiresAt: null }).expiresAt).toBeNull();
  });

  it('carries usedCount/isActive through unchanged', () => {
    const result = toExportedCoupon(baseCoupon);
    expect(result.usedCount).toBe(12);
    expect(result.isActive).toBe(true);
  });
});

describe('toExportedCouponUsage', () => {
  it('carries couponCode, userId, and orderNumber through', () => {
    const result = toExportedCouponUsage({ couponCode: 'SAVE10', userId: 'user-1', orderNumber: 'TSG-260719-00000001', createdAt: new Date('2026-07-19T00:00:00Z') });
    expect(result).toEqual({ couponCode: 'SAVE10', userId: 'user-1', orderNumber: 'TSG-260719-00000001', createdAt: '2026-07-19T00:00:00.000Z' });
  });

  it('carries a null orderNumber through (redemption not tied to a completed order)', () => {
    const result = toExportedCouponUsage({ couponCode: 'SAVE10', userId: 'user-1', orderNumber: null, createdAt: new Date('2026-07-19T00:00:00Z') });
    expect(result.orderNumber).toBeNull();
  });
});
