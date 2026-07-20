import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { Timestamp, AggregateField } from 'firebase-admin/firestore';
import { db, auth } from '../config/firebaseAdmin';
import { requirePermission } from '../shared/auth';
import { parseInput } from '../shared/validation';
import { AppError } from '../shared/errors';
import { buildSalesTrend, buildTopProducts, type OrderForTrend, type OrderItemForTopProducts } from './dashboard.logic';
import type { DashboardStats, SalesTrendPoint, TopProductStat } from './admin.types';
import type { OrderStatus } from '../orders/orders.types';

/**
 * Admin dashboard/analytics Callables, migration Phase 6. Ported from
 * `backend/src/modules/admin/analytics.service.ts`, following the audit's
 * explicit guidance (§15, and the deferred-decision note at line 359):
 * favor Firestore's server-side `count()`/`sum()` aggregation queries over
 * maintaining denormalized counter documents wherever a single query can
 * answer the metric directly — this avoids duplicate data entirely for
 * every metric except `totalCustomers` (see below), and keeps every
 * number here always-consistent with the underlying collections (no
 * separate aggregate doc that could drift).
 *
 * `totalCustomers` is the one metric with no query-count option: there is
 * no Firestore `users` collection in this migration (customer identity
 * lives in Firebase Auth, not Firestore — see audit's auth design), and
 * the Admin SDK's `listUsers()` has no server-side count/filter. This
 * paginates and counts CUSTOMER-role users in JS, capped at 10 pages
 * (10,000 users) for cost/latency safety — a documented limitation, not a
 * silent inaccuracy: past the cap the true count is understated and the
 * response marks `totalCustomers` as approximate via `totalCustomersCapped`.
 */

function ordersCollection() {
  return db.collection('orders');
}

const PENDING_STATUSES: OrderStatus[] = ['CONFIRMED', 'PREPARING', 'PACKED'];
const ALL_STATUSES: OrderStatus[] = ['CONFIRMED', 'PREPARING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
const MAX_CUSTOMER_PAGES = 10;

async function countCustomers(): Promise<{ count: number; capped: boolean }> {
  let count = 0;
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_CUSTOMER_PAGES; page++) {
    const result = await auth.listUsers(1000, pageToken);
    for (const user of result.users) {
      const role = (user.customClaims as { role?: string } | undefined)?.role ?? 'CUSTOMER';
      if (role === 'CUSTOMER') count += 1;
    }
    if (!result.pageToken) return { count, capped: false };
    pageToken = result.pageToken;
  }
  return { count, capped: true };
}

export async function fetchDashboardStats(): Promise<DashboardStats & { totalCustomersCapped: boolean }> {
  const [
    revenueAgg,
    totalOrdersAgg,
    activeProductsAgg,
    pendingOrdersAgg,
    lowStockAgg,
    customers,
    ...statusAggs
  ] = await Promise.all([
    ordersCollection()
      .where('paymentStatus', '==', 'PAID')
      .aggregate({ totalRevenuePaise: AggregateField.sum('totalPaise') })
      .get(),
    ordersCollection().count().get(),
    db.collection('products').where('isActive', '==', true).count().get(),
    ordersCollection().where('status', 'in', PENDING_STATUSES).count().get(),
    db.collection('inventory').where('isLowStock', '==', true).count().get(),
    countCustomers(),
    ...ALL_STATUSES.map((status) => ordersCollection().where('status', '==', status).count().get()),
  ]);

  const totalRevenuePaise = revenueAgg.data().totalRevenuePaise ?? 0;

  const ordersByStatus: Record<string, number> = {};
  ALL_STATUSES.forEach((status, i) => {
    ordersByStatus[status] = statusAggs[i].data().count;
  });

  return {
    totalRevenuePaise,
    totalOrders: totalOrdersAgg.data().count,
    totalCustomers: customers.count,
    totalCustomersCapped: customers.capped,
    activeProducts: activeProductsAgg.data().count,
    pendingOrders: pendingOrdersAgg.data().count,
    lowStockCount: lowStockAgg.data().count,
    ordersByStatus,
  };
}

export const getAdminDashboard = onCall(async (request: CallableRequest) => {
  try {
    requirePermission(request, 'dashboard.view');
    return await fetchDashboardStats();
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

const salesTrendSchema = z.object({ days: z.number().int().min(7).max(90).nullish().transform((v) => v ?? 14) });

export async function fetchSalesTrend(days: number): Promise<SalesTrendPoint[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  since.setUTCHours(0, 0, 0, 0);

  const snap = await ordersCollection().where('placedAt', '>=', Timestamp.fromDate(since)).get();
  const orders: OrderForTrend[] = snap.docs.map((d) => {
    const data = d.data();
    return { placedAtIso: (data.placedAt as Timestamp).toDate().toISOString(), totalPaise: data.totalPaise, paymentStatus: data.paymentStatus };
  });

  return buildSalesTrend(orders, days);
}

export const getSalesTrend = onCall(async (request: CallableRequest) => {
  try {
    requirePermission(request, 'dashboard.view');
    const { days } = parseInput(salesTrendSchema, request.data ?? {});
    return { trend: await fetchSalesTrend(days) };
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

const topProductsSchema = z.object({
  limit: z.number().int().min(1).max(20).nullish().transform((v) => v ?? 8),
  days: z.number().int().min(1).max(90).nullish().transform((v) => v ?? 30),
});
const MAX_ORDERS_FOR_TOP_PRODUCTS = 300;

/**
 * Bounded to the last `days` (default 30, max 90) and at most
 * `MAX_ORDERS_FOR_TOP_PRODUCTS` orders — a deliberate deviation from
 * Express's `topProducts()`, which scans `OrderItem` with NO date bound at
 * all (a single unindexed `groupBy` in SQL; the equivalent in Firestore
 * would be an unbounded `collectionGroup('items')` scan, expensive at
 * scale under per-document read billing). Documented as a known
 * limitation in the Phase 6 report, not a silent behavior change.
 */
export async function fetchTopProducts(limit: number, days: number): Promise<TopProductStat[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);

  const ordersSnap = await ordersCollection()
    .where('placedAt', '>=', Timestamp.fromDate(since))
    .orderBy('placedAt', 'desc')
    .limit(MAX_ORDERS_FOR_TOP_PRODUCTS)
    .get();

  const itemSnaps = await Promise.all(ordersSnap.docs.map((d) => d.ref.collection('items').get()));
  const items: OrderItemForTopProducts[] = itemSnaps.flatMap((snap) =>
    snap.docs.map((d) => {
      const data = d.data();
      return { productName: data.productName, quantity: data.quantity, lineTotalPaise: data.lineTotalPaise };
    }),
  );

  return buildTopProducts(items, limit);
}

export const getTopProducts = onCall(async (request: CallableRequest) => {
  try {
    requirePermission(request, 'dashboard.view');
    const { limit, days } = parseInput(topProductsSchema, request.data ?? {});
    return { products: await fetchTopProducts(limit, days) };
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});
