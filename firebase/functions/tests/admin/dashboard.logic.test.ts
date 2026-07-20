import { describe, it, expect } from 'vitest';
import { buildSalesTrend, buildTopProducts, type OrderForTrend, type OrderItemForTopProducts } from '../../src/admin/dashboard.logic';

describe('buildSalesTrend', () => {
  const NOW = new Date('2026-07-19T12:00:00Z');

  it('fills every day in the window with a zero bucket, even with no orders', () => {
    const trend = buildSalesTrend([], 3, NOW);
    expect(trend).toHaveLength(3);
    expect(trend.map((t) => t.date)).toEqual(['2026-07-17', '2026-07-18', '2026-07-19']);
    expect(trend.every((t) => t.revenuePaise === 0 && t.orderCount === 0)).toBe(true);
  });

  it('buckets a PAID order into its own calendar day', () => {
    const orders: OrderForTrend[] = [{ placedAtIso: '2026-07-18T10:00:00.000Z', totalPaise: 5000, paymentStatus: 'PAID' }];
    const trend = buildSalesTrend(orders, 3, NOW);
    const day = trend.find((t) => t.date === '2026-07-18');
    expect(day).toEqual({ date: '2026-07-18', revenuePaise: 5000, orderCount: 1 });
  });

  it('excludes non-PAID orders from revenue and count', () => {
    const orders: OrderForTrend[] = [{ placedAtIso: '2026-07-18T10:00:00.000Z', totalPaise: 5000, paymentStatus: 'PENDING' }];
    const trend = buildSalesTrend(orders, 3, NOW);
    const day = trend.find((t) => t.date === '2026-07-18');
    expect(day).toEqual({ date: '2026-07-18', revenuePaise: 0, orderCount: 0 });
  });

  it('sums multiple PAID orders on the same day', () => {
    const orders: OrderForTrend[] = [
      { placedAtIso: '2026-07-19T01:00:00.000Z', totalPaise: 1000, paymentStatus: 'PAID' },
      { placedAtIso: '2026-07-19T23:00:00.000Z', totalPaise: 2000, paymentStatus: 'PAID' },
    ];
    const day = buildSalesTrend(orders, 1, NOW).find((t) => t.date === '2026-07-19');
    expect(day).toEqual({ date: '2026-07-19', revenuePaise: 3000, orderCount: 2 });
  });

  it('ignores an order outside the requested window', () => {
    const orders: OrderForTrend[] = [{ placedAtIso: '2020-01-01T00:00:00.000Z', totalPaise: 1000, paymentStatus: 'PAID' }];
    const trend = buildSalesTrend(orders, 3, NOW);
    expect(trend.reduce((s, t) => s + t.revenuePaise, 0)).toBe(0);
  });
});

describe('buildTopProducts', () => {
  it('sums quantity and revenue per product name', () => {
    const items: OrderItemForTopProducts[] = [
      { productName: 'Almonds', quantity: 2, lineTotalPaise: 10000 },
      { productName: 'Almonds', quantity: 1, lineTotalPaise: 5000 },
      { productName: 'Cashews', quantity: 3, lineTotalPaise: 9000 },
    ];
    const result = buildTopProducts(items, 10);
    expect(result).toContainEqual({ productName: 'Almonds', quantitySold: 3, revenuePaise: 15000 });
    expect(result).toContainEqual({ productName: 'Cashews', quantitySold: 3, revenuePaise: 9000 });
  });

  it('ranks by quantity sold descending', () => {
    const items: OrderItemForTopProducts[] = [
      { productName: 'Low', quantity: 1, lineTotalPaise: 100 },
      { productName: 'High', quantity: 10, lineTotalPaise: 100 },
    ];
    const result = buildTopProducts(items, 10);
    expect(result[0].productName).toBe('High');
    expect(result[1].productName).toBe('Low');
  });

  it('truncates to the requested limit', () => {
    const items: OrderItemForTopProducts[] = Array.from({ length: 5 }, (_, i) => ({
      productName: `P${i}`,
      quantity: i + 1,
      lineTotalPaise: 100,
    }));
    expect(buildTopProducts(items, 2)).toHaveLength(2);
  });

  it('returns an empty array for no items', () => {
    expect(buildTopProducts([], 10)).toEqual([]);
  });
});
