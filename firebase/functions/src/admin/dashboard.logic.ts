import type { SalesTrendPoint, TopProductStat } from './admin.types';

/**
 * Pure aggregation logic for the admin dashboard, mirroring
 * `backend/src/modules/admin/analytics.service.ts`'s `salesTrend()`/
 * `topProducts()` bucketing exactly (both already bucket in JS rather than
 * relying on SQL date functions or GROUP BY — audit §15 flags this as
 * "already Firestore-friendly," meaning only the query that produces the
 * raw rows changes, not this math). Kept side-effect-free so the exact
 * bucketing/ranking behavior is independently unit-testable without
 * Firestore.
 */

export interface OrderForTrend {
  placedAtIso: string;
  totalPaise: number;
  paymentStatus: string;
}

/** Buckets PAID orders by calendar day (UTC), filling in zero-revenue days so the chart has no gaps. */
export function buildSalesTrend(orders: OrderForTrend[], days: number, now: Date = new Date()): SalesTrendPoint[] {
  const buckets = new Map<string, { revenuePaise: number; orderCount: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    buckets.set(d.toISOString().slice(0, 10), { revenuePaise: 0, orderCount: 0 });
  }

  for (const order of orders) {
    if (order.paymentStatus !== 'PAID') continue;
    const day = order.placedAtIso.slice(0, 10);
    const bucket = buckets.get(day);
    if (!bucket) continue; // outside the requested window
    bucket.revenuePaise += order.totalPaise;
    bucket.orderCount += 1;
  }

  return Array.from(buckets.entries()).map(([date, b]) => ({ date, ...b }));
}

export interface OrderItemForTopProducts {
  productName: string;
  quantity: number;
  lineTotalPaise: number;
}

/** Sums quantity/revenue per product name across order items, ranked by quantity sold descending. */
export function buildTopProducts(items: OrderItemForTopProducts[], limit: number): TopProductStat[] {
  const byProduct = new Map<string, { quantitySold: number; revenuePaise: number }>();
  for (const item of items) {
    const entry = byProduct.get(item.productName) ?? { quantitySold: 0, revenuePaise: 0 };
    entry.quantitySold += item.quantity;
    entry.revenuePaise += item.lineTotalPaise;
    byProduct.set(item.productName, entry);
  }

  return Array.from(byProduct.entries())
    .map(([productName, stats]) => ({ productName, ...stats }))
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, limit);
}
