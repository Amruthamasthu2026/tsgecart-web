import { describe, it, expect } from 'vitest';
import { toFirestoreCouponDoc, toFirestoreCouponUsageDoc, parseArgs, type ExportedCoupon } from '../../scripts/importCouponsToFirestore';

function coupon(overrides: Partial<ExportedCoupon> = {}): ExportedCoupon {
  return {
    code: 'save10',
    description: '10% off',
    type: 'PERCENTAGE',
    value: '10.00',
    minOrder: '199.00',
    maxDiscount: '100.00',
    usageLimit: 500,
    perUserLimit: 1,
    usedCount: 12,
    startsAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-12-31T00:00:00.000Z',
    isActive: true,
    ...overrides,
  };
}

describe('toFirestoreCouponDoc', () => {
  it('uppercases the code (matches the doc-ID convention)', () => {
    expect(toFirestoreCouponDoc(coupon()).code).toBe('SAVE10');
  });

  it('keeps a PERCENTAGE value as a plain 0-100 number, not paise', () => {
    expect(toFirestoreCouponDoc(coupon({ type: 'PERCENTAGE', value: '15.00' })).value).toBe(15);
  });

  it('converts a FLAT value to paise', () => {
    expect(toFirestoreCouponDoc(coupon({ type: 'FLAT', value: '50.00' })).value).toBe(5000);
  });

  it('converts minOrder/maxDiscount to paise, and null maxDiscount stays null', () => {
    const doc = toFirestoreCouponDoc(coupon());
    expect(doc.minOrderPaise).toBe(19900);
    expect(doc.maxDiscountPaise).toBe(10000);
    expect(toFirestoreCouponDoc(coupon({ maxDiscount: null })).maxDiscountPaise).toBeNull();
  });

  it('carries usageLimit through, including null (unlimited)', () => {
    expect(toFirestoreCouponDoc(coupon({ usageLimit: null })).usageLimit).toBeNull();
    expect(toFirestoreCouponDoc(coupon({ usageLimit: 50 })).usageLimit).toBe(50);
  });

  it('carries usedCount/perUserLimit/isActive through unchanged', () => {
    const doc = toFirestoreCouponDoc(coupon());
    expect(doc.usedCount).toBe(12);
    expect(doc.perUserLimit).toBe(1);
    expect(doc.isActive).toBe(true);
  });
});

describe('toFirestoreCouponUsageDoc', () => {
  it('uppercases couponCode and carries userId/createdAt through', () => {
    const doc = toFirestoreCouponUsageDoc({ couponCode: 'save10', userId: 'user-1', orderNumber: 'TSG-260719-00000001', createdAt: '2026-07-19T00:00:00.000Z' });
    expect(doc.couponCode).toBe('SAVE10');
    expect(doc.userId).toBe('user-1');
    expect(doc.createdAt).toBe('2026-07-19T00:00:00.000Z');
  });

  it('maps orderNumber to orderId, falling back to an empty string when null', () => {
    expect(toFirestoreCouponUsageDoc({ couponCode: 'SAVE10', userId: 'u1', orderNumber: 'TSG-1', createdAt: '2026-01-01T00:00:00Z' }).orderId).toBe('TSG-1');
    expect(toFirestoreCouponUsageDoc({ couponCode: 'SAVE10', userId: 'u1', orderNumber: null, createdAt: '2026-01-01T00:00:00Z' }).orderId).toBe('');
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
