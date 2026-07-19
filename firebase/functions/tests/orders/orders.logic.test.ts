import { describe, it, expect } from 'vitest';
import {
  ORDER_STATUS_TRANSITIONS,
  CUSTOMER_CANCELLABLE_STATUSES,
  canTransitionOrderStatus,
  generateOrderNumber,
  sumLineTotalsPaise,
  computeOrderTotals,
  type OrderLineForTotals,
} from '../../src/orders/orders.logic';

describe('canTransitionOrderStatus', () => {
  it('allows every documented forward transition', () => {
    expect(canTransitionOrderStatus('CONFIRMED', 'PREPARING')).toBe(true);
    expect(canTransitionOrderStatus('PREPARING', 'PACKED')).toBe(true);
    expect(canTransitionOrderStatus('PACKED', 'OUT_FOR_DELIVERY')).toBe(true);
    expect(canTransitionOrderStatus('OUT_FOR_DELIVERY', 'DELIVERED')).toBe(true);
  });

  it('allows cancellation from CONFIRMED, PREPARING, and PACKED', () => {
    expect(canTransitionOrderStatus('CONFIRMED', 'CANCELLED')).toBe(true);
    expect(canTransitionOrderStatus('PREPARING', 'CANCELLED')).toBe(true);
    expect(canTransitionOrderStatus('PACKED', 'CANCELLED')).toBe(true);
  });

  it('rejects skipping a stage', () => {
    expect(canTransitionOrderStatus('CONFIRMED', 'PACKED')).toBe(false);
    expect(canTransitionOrderStatus('CONFIRMED', 'DELIVERED')).toBe(false);
  });

  it('rejects any transition out of a terminal status', () => {
    expect(canTransitionOrderStatus('DELIVERED', 'CANCELLED')).toBe(false);
    expect(canTransitionOrderStatus('CANCELLED', 'CONFIRMED')).toBe(false);
  });

  it('rejects cancelling an order already out for delivery', () => {
    expect(canTransitionOrderStatus('OUT_FOR_DELIVERY', 'CANCELLED')).toBe(false);
  });

  it('every status has an explicit (possibly empty) transitions entry', () => {
    expect(Object.keys(ORDER_STATUS_TRANSITIONS).sort()).toEqual(
      ['CANCELLED', 'CONFIRMED', 'DELIVERED', 'OUT_FOR_DELIVERY', 'PACKED', 'PREPARING'].sort(),
    );
  });
});

describe('CUSTOMER_CANCELLABLE_STATUSES', () => {
  it('only allows customer-initiated cancellation from CONFIRMED and PREPARING', () => {
    expect(CUSTOMER_CANCELLABLE_STATUSES).toEqual(['CONFIRMED', 'PREPARING']);
  });
});

describe('generateOrderNumber', () => {
  it('matches the TSG-YYMMDD-######## format', () => {
    const orderNumber = generateOrderNumber(new Date('2026-07-19T00:00:00Z'));
    expect(orderNumber).toMatch(/^TSG-\d{6}-\d{8}$/);
    expect(orderNumber.slice(4, 10)).toBe('260719');
  });

  it('produces different numbers across repeated calls (probabilistically distinct)', () => {
    const numbers = new Set(Array.from({ length: 20 }, () => generateOrderNumber()));
    expect(numbers.size).toBeGreaterThan(1);
  });
});

describe('sumLineTotalsPaise', () => {
  it('sums lineTotalPaise across all lines', () => {
    const lines: OrderLineForTotals[] = [
      { lineTotalPaise: 10_000, gstRatePercent: 5 },
      { lineTotalPaise: 5_000, gstRatePercent: 0 },
    ];
    expect(sumLineTotalsPaise(lines)).toBe(15_000);
  });
});

describe('computeOrderTotals', () => {
  const lines: OrderLineForTotals[] = [{ lineTotalPaise: 100_000, gstRatePercent: 5 }];

  it('computes subtotal, discount, delivery, and total', () => {
    const totals = computeOrderTotals(lines, 10_000, 3_000);
    expect(totals.subtotalPaise).toBe(100_000);
    expect(totals.discountPaise).toBe(10_000);
    expect(totals.deliveryChargePaise).toBe(3_000);
    expect(totals.totalPaise).toBe(93_000); // (100000-10000)+3000
  });

  it('clamps total at zero when discount exceeds subtotal + delivery is zero', () => {
    const totals = computeOrderTotals(lines, 200_000, 0);
    expect(totals.discountPaise).toBe(100_000); // clamped to subtotal
    expect(totals.totalPaise).toBe(0);
  });

  it('never lets discountPaise exceed the subtotal even if a caller passes a larger value', () => {
    const totals = computeOrderTotals(lines, 999_999, 3_000);
    expect(totals.discountPaise).toBe(100_000);
  });

  it('includes convenienceFeePaise in the total when provided (currently always 0 in production)', () => {
    const totals = computeOrderTotals(lines, 0, 0, 500);
    expect(totals.convenienceFeePaise).toBe(500);
    expect(totals.totalPaise).toBe(100_500);
  });

  it('computes GST-inclusive tax as the embedded portion, not added on top', () => {
    const totals = computeOrderTotals(lines, 0, 0);
    // lineTotal=100000, rate=5% -> tax = 100000 - 100000/1.05 = 4761.9... rounded
    expect(totals.taxPaise).toBe(Math.round(100_000 - 100_000 / 1.05));
    expect(totals.totalPaise).toBe(100_000); // tax is informational, not added
  });
});
