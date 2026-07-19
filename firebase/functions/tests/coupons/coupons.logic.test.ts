import { describe, it, expect } from 'vitest';
import { evaluateGlobalCoupon, type CouponEvalShape } from '../../src/coupons/coupons.logic';
import { BadRequestError } from '../../src/shared/errors';

function baseCoupon(overrides: Partial<CouponEvalShape> = {}): CouponEvalShape {
  return {
    type: 'PERCENTAGE',
    value: 10,
    minOrderPaise: 10_000,
    maxDiscountPaise: null,
    usageLimit: null,
    usedCount: 0,
    perUserLimit: 1,
    startsAt: new Date('2020-01-01T00:00:00Z'),
    expiresAt: null,
    isActive: true,
    ...overrides,
  };
}

const NOW = new Date('2026-07-19T12:00:00Z');

describe('evaluateGlobalCoupon', () => {
  it('computes a PERCENTAGE discount', () => {
    const result = evaluateGlobalCoupon({ coupon: baseCoupon({ value: 10 }), subtotalPaise: 100_000, userUsageCount: 0, now: NOW });
    expect(result.discountPaise).toBe(10_000);
  });

  it('computes a FLAT discount (value is already paise)', () => {
    const result = evaluateGlobalCoupon({
      coupon: baseCoupon({ type: 'FLAT', value: 5_000 }),
      subtotalPaise: 100_000,
      userUsageCount: 0,
      now: NOW,
    });
    expect(result.discountPaise).toBe(5_000);
  });

  it('caps a PERCENTAGE discount at maxDiscountPaise', () => {
    const result = evaluateGlobalCoupon({
      coupon: baseCoupon({ type: 'PERCENTAGE', value: 50, maxDiscountPaise: 2_000 }),
      subtotalPaise: 100_000,
      userUsageCount: 0,
      now: NOW,
    });
    expect(result.discountPaise).toBe(2_000);
  });

  it('never returns a discount larger than the subtotal', () => {
    const result = evaluateGlobalCoupon({
      coupon: baseCoupon({ type: 'FLAT', value: 999_999 }),
      subtotalPaise: 100_000,
      userUsageCount: 0,
      now: NOW,
    });
    expect(result.discountPaise).toBe(100_000);
  });

  it('rejects an inactive coupon', () => {
    expect(() =>
      evaluateGlobalCoupon({ coupon: baseCoupon({ isActive: false }), subtotalPaise: 100_000, userUsageCount: 0, now: NOW }),
    ).toThrow(BadRequestError);
  });

  it('rejects a coupon that has not started yet', () => {
    expect(() =>
      evaluateGlobalCoupon({
        coupon: baseCoupon({ startsAt: new Date('2030-01-01T00:00:00Z') }),
        subtotalPaise: 100_000,
        userUsageCount: 0,
        now: NOW,
      }),
    ).toThrow('This coupon is not active yet');
  });

  it('rejects an expired coupon', () => {
    expect(() =>
      evaluateGlobalCoupon({
        coupon: baseCoupon({ expiresAt: new Date('2020-01-01T00:00:00Z') }),
        subtotalPaise: 100_000,
        userUsageCount: 0,
        now: NOW,
      }),
    ).toThrow('This coupon has expired');
  });

  it('rejects when the subtotal is below minOrderPaise', () => {
    expect(() =>
      evaluateGlobalCoupon({
        coupon: baseCoupon({ minOrderPaise: 100_000 }),
        subtotalPaise: 50_000,
        userUsageCount: 0,
        now: NOW,
      }),
    ).toThrow(/Add items worth/);
  });

  it('rejects when the global usage limit is reached', () => {
    expect(() =>
      evaluateGlobalCoupon({
        coupon: baseCoupon({ usageLimit: 10, usedCount: 10 }),
        subtotalPaise: 100_000,
        userUsageCount: 0,
        now: NOW,
      }),
    ).toThrow('This coupon has reached its usage limit');
  });

  it('allows unlimited usage when usageLimit is null even with a high usedCount', () => {
    const result = evaluateGlobalCoupon({
      coupon: baseCoupon({ usageLimit: null, usedCount: 999_999 }),
      subtotalPaise: 100_000,
      userUsageCount: 0,
      now: NOW,
    });
    expect(result.discountPaise).toBeGreaterThan(0);
  });

  it('rejects when the caller has already reached their per-user limit', () => {
    expect(() =>
      evaluateGlobalCoupon({
        coupon: baseCoupon({ perUserLimit: 1 }),
        subtotalPaise: 100_000,
        userUsageCount: 1,
        now: NOW,
      }),
    ).toThrow('You have already used this coupon');
  });

  it('validates in the documented order: isActive before startsAt before expiresAt before minOrder before limits', () => {
    // An inactive AND not-yet-started coupon should fail on isActive first.
    expect(() =>
      evaluateGlobalCoupon({
        coupon: baseCoupon({ isActive: false, startsAt: new Date('2030-01-01T00:00:00Z') }),
        subtotalPaise: 100_000,
        userUsageCount: 0,
        now: NOW,
      }),
    ).toThrow('Invalid coupon code');
  });
});
