import { httpsCallable } from 'firebase/functions';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { firebaseFunctions, firebaseFirestore } from '../lib/firebase';
import type { Category } from '../features/catalog/catalog.types';
import type { DashboardStats, SalesPoint, BulkImportResult } from '../features/admin/admin.api';

/**
 * Firestore-backed admin console service, migration Phase 6 — added
 * ALONGSIDE `features/admin/admin.api.ts` (the existing Express-backed
 * client), which is untouched. Every exported function here returns the
 * SAME shape `adminApi`'s equivalent method returns, so `AdminLayout` and
 * the individual `Admin*.tsx` pages only need to switch WHICH api object
 * they call (via `useFirestoreAdmin`) — no rendering code changes.
 *
 * A single umbrella flag (`VITE_USE_FIRESTORE_ADMIN`), unlike the
 * customer-side's granular per-feature flags — see .env.example: "the
 * admin console is one operational surface," so there is no meaningful
 * partial state where products are Firestore-backed but orders are not.
 *
 * Data-source split, per firestore.rules (Phase 3-6): `products`,
 * `categories`, `productVariants`, `coupons`, `rewardConfigs`,
 * `deliveryZones`, `serviceablePincodes` and `orders` (read-only) are all
 * direct-client-read/writable by STAFF/ADMIN with the matching custom-claim
 * permission — those use plain Firestore SDK calls here, avoiding a new
 * Callable for simple CRUD. Anything that must stay transactionally
 * consistent with `inventory` (Function-only writes, always) or with
 * Firebase Auth (`listUsers`/`updateUser`, unavailable to a browser client)
 * goes through the Phase 6 Callables instead.
 *
 * Known, documented gaps vs. the Express admin console (see the Phase 6
 * completion report for the full rationale):
 *  - `uploadImage`: no Cloud Storage integration was added in this
 *    migration; `AdminProducts` falls back to a manual image-URL field
 *    when `useFirestoreAdmin` is on.
 *  - "Import Hyderabad pincodes": no Firestore port (no live Express
 *    frontend consumer either — see delivery/delivery.function.ts header);
 *    the button is disabled with an inline note in Firebase mode.
 *  - Order search only matches on order number (client-side, over the
 *    fetched page) — order documents have no denormalized customer email
 *    to search against.
 */

export const useFirestoreAdmin = import.meta.env.VITE_USE_FIRESTORE_ADMIN === 'true';

function paiseToRupees(paise: number): number {
  return paise / 100;
}
function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

// ── Callables ─────────────────────────────────────────────────────────────

interface FsDashboardStats {
  totalRevenuePaise: number;
  totalOrders: number;
  totalCustomers: number;
  activeProducts: number;
  pendingOrders: number;
  lowStockCount: number;
  ordersByStatus: Record<string, number>;
}
interface FsSalesTrendPoint {
  date: string;
  revenuePaise: number;
  orderCount: number;
}
interface FsTopProductStat {
  productName: string;
  quantitySold: number;
  revenuePaise: number;
}
interface FsAdminCustomerSummary {
  uid: string;
  email: string | null;
  displayName: string | null;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string | null;
}
interface FsRewardAnalytics {
  totalSpins: number;
  todaySpins: number;
  redeemedCount: number;
  totalCashbackPaise: number;
  mostWonTier: { cashbackAmountPaise: number; count: number } | null;
}
interface FsBulkImportResult {
  toCreate: Array<{ code: string; zoneId: string }>;
  toUpdate: Array<{ code: string; zoneId: string }>;
  invalid: Array<{ code: string; reason: string }>;
  failed: Array<{ code: string; reason: string }>;
  duplicates: string[];
  skipped: string[];
  warnings: Array<{ code: string; message: string }>;
  stats: BulkImportResult['stats'];
}
interface AdminVariantPayload {
  sku: string;
  unitLabel: string;
  mrpPaise: number;
  pricePaise: number;
  stock: number;
  isDefault: boolean;
}
interface AdminUpsertProductPayload {
  slug?: string | null;
  name: string;
  categoryId: string;
  description?: string | null;
  images: string[];
  gstRatePercent?: number;
  variants: AdminVariantPayload[];
}

const getAdminDashboardCallable = httpsCallable<undefined, FsDashboardStats>(firebaseFunctions, 'getAdminDashboard');
const getSalesTrendCallable = httpsCallable<{ days?: number } | undefined, { trend: FsSalesTrendPoint[] }>(
  firebaseFunctions,
  'getSalesTrend',
);
const getTopProductsCallable = httpsCallable<{ limit?: number; days?: number } | undefined, { products: FsTopProductStat[] }>(
  firebaseFunctions,
  'getTopProducts',
);
const adminListCustomersCallable = httpsCallable<
  { search?: string } | undefined,
  { customers: FsAdminCustomerSummary[]; truncated: boolean }
>(firebaseFunctions, 'adminListCustomers');
const adminSetCustomerActiveCallable = httpsCallable<{ uid: string; isActive: boolean }, { uid: string; isActive: boolean }>(
  firebaseFunctions,
  'adminSetCustomerActive',
);
const adminUpsertProductCallable = httpsCallable<AdminUpsertProductPayload, { slug: string }>(
  firebaseFunctions,
  'adminUpsertProduct',
);
const adminDeleteProductCallable = httpsCallable<{ slug: string }, { deleted: boolean }>(firebaseFunctions, 'adminDeleteProduct');
const getRewardAnalyticsCallable = httpsCallable<undefined, FsRewardAnalytics>(firebaseFunctions, 'getRewardAnalytics');
const adminBulkImportPincodesCallable = httpsCallable<
  { items: Array<{ code: string; zoneName?: string }>; zoneId?: string; mode?: 'skip' | 'upsert' },
  FsBulkImportResult
>(firebaseFunctions, 'adminBulkImportPincodes');
const adminUpdateOrderStatusCallable = httpsCallable<{ orderId: string; status: string; note?: string }, { updated: boolean }>(
  firebaseFunctions,
  'adminUpdateOrderStatus',
);

// ── Analytics / dashboard ────────────────────────────────────────────────

async function dashboard(): Promise<DashboardStats> {
  const result = await getAdminDashboardCallable();
  const d = result.data;
  return {
    totalRevenue: paiseToRupees(d.totalRevenuePaise),
    totalOrders: d.totalOrders,
    totalCustomers: d.totalCustomers,
    activeProducts: d.activeProducts,
    pendingOrders: d.pendingOrders,
    lowStockItems: d.lowStockCount,
    ordersByStatus: Object.entries(d.ordersByStatus).map(([status, count]) => ({ status, count })),
  };
}

async function salesTrend(days = 14): Promise<SalesPoint[]> {
  const result = await getSalesTrendCallable({ days });
  return result.data.trend.map((t) => ({ date: t.date, revenue: paiseToRupees(t.revenuePaise), orders: t.orderCount }));
}

async function topProducts(): Promise<Array<{ productName: string; unitsSold: number; revenue: number }>> {
  const result = await getTopProductsCallable();
  return result.data.products.map((p) => ({ productName: p.productName, unitsSold: p.quantitySold, revenue: paiseToRupees(p.revenuePaise) }));
}

/** Capped at 50 low-stock items — a documented, bounded admin listing (same rationale as getTopProducts). */
async function lowStock(): Promise<Array<{ sku: string; productName: string; unitLabel: string; stock: number; threshold: number }>> {
  const invSnap = await getDocs(query(collection(firebaseFirestore, 'inventory'), where('isLowStock', '==', true), fsLimit(50)));
  const skus = invSnap.docs.map((d) => d.id);
  if (skus.length === 0) return [];

  const variantSnaps = await Promise.all(skus.map((sku) => getDoc(doc(firebaseFirestore, 'productVariants', sku))));
  const productIds = new Set<string>();
  const variantBySku = new Map<string, { productId: string; unitLabel: string }>();
  variantSnaps.forEach((snap, i) => {
    if (!snap.exists()) return;
    const data = snap.data() as { productId: string; unitLabel: string };
    variantBySku.set(skus[i], { productId: data.productId, unitLabel: data.unitLabel });
    productIds.add(data.productId);
  });

  const productSnaps = await Promise.all([...productIds].map((id) => getDoc(doc(firebaseFirestore, 'products', id))));
  const nameByProductId = new Map<string, string>();
  productSnaps.forEach((snap) => {
    if (snap.exists()) nameByProductId.set(snap.id, (snap.data() as { name: string }).name);
  });

  return invSnap.docs.map((d) => {
    const data = d.data() as { stock: number; lowStockThreshold: number };
    const variant = variantBySku.get(d.id);
    return {
      sku: d.id,
      productName: variant ? (nameByProductId.get(variant.productId) ?? 'Unknown product') : 'Unknown product',
      unitLabel: variant?.unitLabel ?? '',
      stock: data.stock,
      threshold: data.lowStockThreshold,
    };
  });
}

// ── Products ──────────────────────────────────────────────────────────────

export interface CreateProductPayload {
  name: string;
  categoryId: string;
  description?: string;
  gstRate?: number;
  images: string[];
  variants: Array<{ sku: string; unitLabel: string; mrp: number; price: number; stock: number; isDefault: boolean }>;
}

interface FsProductListRow {
  id: string;
  name: string;
  categoryName: string;
  minPricePaise: number;
}

/** Admin product listing, capped at 50 (matches Express's own `adminApi.listProducts()`, which also passes `limit: 50`). */
async function listProducts(): Promise<{ products: Array<Record<string, unknown> & { id: string }>; meta: unknown }> {
  const snap = await getDocs(query(collection(firebaseFirestore, 'products'), orderBy('name', 'asc'), fsLimit(50)));
  const products: FsProductListRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FsProductListRow, 'id'>) }));

  const counts = await Promise.all(
    products.map((p) => getCountFromServer(query(collection(firebaseFirestore, 'productVariants'), where('productId', '==', p.id)))),
  );

  return {
    products: products.map((p, i) => ({
      id: p.id,
      name: p.name,
      category: { name: p.categoryName },
      variants: Array.from({ length: counts[i].data().count }, () => ({ price: String(paiseToRupees(p.minPricePaise)) })),
    })),
    meta: { total: products.length },
  };
}

async function createProduct(payload: CreateProductPayload): Promise<{ slug: string }> {
  const result = await adminUpsertProductCallable({
    name: payload.name,
    categoryId: payload.categoryId,
    description: payload.description ?? null,
    images: payload.images,
    gstRatePercent: payload.gstRate ?? 0,
    variants: payload.variants.map((v) => ({
      sku: v.sku,
      unitLabel: v.unitLabel,
      mrpPaise: rupeesToPaise(v.mrp),
      pricePaise: rupeesToPaise(v.price),
      stock: v.stock,
      isDefault: v.isDefault,
    })),
  });
  return result.data;
}

async function deleteProduct(slug: string): Promise<void> {
  await adminDeleteProductCallable({ slug });
}

// ── Categories (shared read with the public catalog — this admin listing
// includes inactive categories too, matching firestore.rules'
// `isStaffOrAdmin()` read grant) ────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

async function listCategoriesAdmin(): Promise<Category[]> {
  const snap = await getDocs(query(collection(firebaseFirestore, 'categories'), orderBy('sortOrder', 'asc'), orderBy('name', 'asc')));
  return snap.docs.map((d) => {
    const data = d.data() as { name: string; imageUrl: string | null; isActive: boolean; productCount: number };
    return { id: d.id, name: data.name, slug: d.id, imageUrl: data.imageUrl, isActive: data.isActive, _count: { products: data.productCount } };
  });
}

async function createCategory(payload: { name: string }): Promise<void> {
  const base = slugify(payload.name) || 'category';
  let slug = base;
  for (let attempt = 2; attempt <= 25; attempt++) {
    const snap = await getDoc(doc(firebaseFirestore, 'categories', slug));
    if (!snap.exists()) break;
    slug = `${base}-${attempt}`;
  }
  const now = serverTimestamp();
  await setDoc(doc(firebaseFirestore, 'categories', slug), {
    name: payload.name,
    slug,
    description: null,
    imageUrl: null,
    parentId: null,
    sortOrder: 0,
    isActive: true,
    productCount: 0,
    createdAt: now,
    updatedAt: now,
  });
}

async function deleteCategory(id: string): Promise<void> {
  await deleteDoc(doc(firebaseFirestore, 'categories', id));
}

// ── Orders (read: direct client, per firestore.rules `orders.manage`;
// status update: the existing Phase 5 `adminUpdateOrderStatus` Callable —
// the whole status-transition flow, including restocking on cancel, must
// stay transactional) ───────────────────────────────────────────────────

async function listOrders(
  params: Record<string, unknown> = {},
): Promise<{ orders: Array<Record<string, unknown> & { id: string }>; meta: unknown }> {
  const constraints = [orderBy('placedAt', 'desc'), fsLimit(100)];
  const status = params.status as string | undefined;
  const q = status
    ? query(collection(firebaseFirestore, 'orders'), where('status', '==', status), ...constraints)
    : query(collection(firebaseFirestore, 'orders'), ...constraints);
  const snap = await getDocs(q);

  const search = (params.search as string | undefined)?.trim().toLowerCase();
  const docs = search ? snap.docs.filter((d) => d.id.toLowerCase().includes(search)) : snap.docs;

  const orders = docs.map((d) => {
    const data = d.data() as {
      totalPaise: number;
      paymentMethod: string;
      paymentStatus: string;
      status: string;
      placedAt: { toDate(): Date };
    };
    return {
      id: d.id,
      orderNumber: d.id,
      total: String(paiseToRupees(data.totalPaise)),
      payment: { method: data.paymentMethod, status: data.paymentStatus },
      placedAt: data.placedAt.toDate().toISOString(),
      status: data.status,
    };
  });

  return { orders, meta: { total: orders.length } };
}

async function updateOrderStatus(id: string, status: string): Promise<void> {
  await adminUpdateOrderStatusCallable({ orderId: id, status });
}

// ── Coupons (direct client read/write, per firestore.rules `coupons.manage`) ─

async function listCoupons(): Promise<Array<Record<string, unknown> & { id: string }>> {
  const snap = await getDocs(collection(firebaseFirestore, 'coupons'));
  return snap.docs.map((d) => {
    const data = d.data() as { type: 'FLAT' | 'PERCENTAGE'; value: number; minOrderPaise: number; usedCount: number };
    return {
      id: d.id,
      code: d.id,
      type: data.type,
      value: data.type === 'FLAT' ? String(paiseToRupees(data.value)) : data.value,
      minOrder: String(paiseToRupees(data.minOrderPaise)),
      usedCount: data.usedCount,
    };
  });
}

async function createCoupon(payload: { code: string; type: string; value: number; minOrder: number; perUserLimit: number }): Promise<void> {
  const code = payload.code.trim().toUpperCase();
  const now = serverTimestamp();
  await setDoc(doc(firebaseFirestore, 'coupons', code), {
    code,
    description: null,
    type: payload.type,
    value: payload.type === 'FLAT' ? rupeesToPaise(payload.value) : payload.value,
    minOrderPaise: rupeesToPaise(payload.minOrder),
    maxDiscountPaise: null,
    usageLimit: null,
    perUserLimit: payload.perUserLimit,
    usedCount: 0,
    startsAt: now,
    expiresAt: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}

async function deleteCoupon(id: string): Promise<void> {
  await deleteDoc(doc(firebaseFirestore, 'coupons', id));
}

// ── Customers (Firebase Auth is the source of truth — Phase 6 Callables) ──

async function listCustomers(
  params: Record<string, unknown> = {},
): Promise<{ customers: Array<Record<string, unknown> & { id: string; isActive: boolean }>; meta: unknown }> {
  const result = await adminListCustomersCallable({ search: params.search as string | undefined });
  const customers = result.data.customers.map((c) => ({
    id: c.uid,
    name: c.displayName ?? c.email ?? c.uid,
    email: c.email ?? '—',
    phone: null,
    isActive: c.isActive,
    createdAt: c.createdAt ?? new Date().toISOString(),
    _count: { orders: 0 },
  }));
  return { customers, meta: { total: customers.length, truncated: result.data.truncated } };
}

async function setCustomerActive(id: string, isActive: boolean): Promise<void> {
  await adminSetCustomerActiveCallable({ uid: id, isActive });
}

// ── Delivery (zones/pincodes: direct client read/write per
// `delivery.manage`; bulk CSV/paste import: the Phase 6 Callable, which
// needs server-side batching beyond a single client round trip) ─────────

async function listZones(): Promise<Array<{ id: string; name: string }>> {
  const snap = await getDocs(query(collection(firebaseFirestore, 'deliveryZones'), orderBy('name', 'asc')));
  return snap.docs.map((d) => ({ id: d.id, name: (d.data() as { name: string }).name }));
}

async function createZone(payload: {
  name: string;
  deliveryCharge: number;
  freeDeliveryLimit: number;
  minEtaMinutes: number;
  maxEtaMinutes: number;
}): Promise<void> {
  const now = serverTimestamp();
  await addDoc(collection(firebaseFirestore, 'deliveryZones'), {
    name: payload.name,
    description: null,
    deliveryChargePaise: rupeesToPaise(payload.deliveryCharge),
    freeDeliveryLimitPaise: rupeesToPaise(payload.freeDeliveryLimit),
    minEtaMinutes: payload.minEtaMinutes,
    maxEtaMinutes: payload.maxEtaMinutes,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}

async function listPincodes(): Promise<Array<{ id: string; code: string; isServiceable: boolean; zone?: { id: string; name: string } | null }>> {
  const [zonesSnap, pincodesSnap] = await Promise.all([
    getDocs(collection(firebaseFirestore, 'deliveryZones')),
    getDocs(query(collection(firebaseFirestore, 'serviceablePincodes'), orderBy('__name__', 'asc'), fsLimit(500))),
  ]);
  const zoneById = new Map(zonesSnap.docs.map((d) => [d.id, (d.data() as { name: string }).name]));
  return pincodesSnap.docs.map((d) => {
    const data = d.data() as { zoneId: string | null; isServiceable: boolean };
    return {
      id: d.id,
      code: d.id,
      isServiceable: data.isServiceable,
      zone: data.zoneId ? { id: data.zoneId, name: zoneById.get(data.zoneId) ?? '—' } : null,
    };
  });
}

async function createPincode(payload: { code: string; zoneId?: string }): Promise<void> {
  const now = serverTimestamp();
  await setDoc(doc(firebaseFirestore, 'serviceablePincodes', payload.code), {
    city: 'Hyderabad',
    state: 'Telangana',
    zoneId: payload.zoneId ?? null,
    isServiceable: true,
    createdAt: now,
    updatedAt: now,
  });
}

async function bulkImportPincodes(items: Array<{ code: string; zoneName?: string }>, zoneId?: string, mode: 'skip' | 'upsert' = 'skip'): Promise<BulkImportResult> {
  const result = await adminBulkImportPincodesCallable({ items, zoneId, mode });
  return result.data as unknown as BulkImportResult;
}

/**
 * Bulk activate/deactivate/move/delete, direct client `writeBatch` —
 * `serviceablePincodes` is client-writable for `delivery.manage`
 * (firestore.rules), so unlike the CSV/paste import this needs no
 * Callable. Batched at 400 ops (the Firestore client SDK limit), matching
 * every server-side batch write elsewhere in this migration.
 */
async function bulkActionPincodes(ids: string[], action: 'activate' | 'deactivate' | 'move' | 'delete', zoneId?: string): Promise<{ affected: number }> {
  const now = serverTimestamp();
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const batch = writeBatch(firebaseFirestore);
    for (const id of chunk) {
      const ref = doc(firebaseFirestore, 'serviceablePincodes', id);
      if (action === 'delete') batch.delete(ref);
      else if (action === 'activate') batch.update(ref, { isServiceable: true, updatedAt: now });
      else if (action === 'deactivate') batch.update(ref, { isServiceable: false, updatedAt: now });
      else if (action === 'move' && zoneId) batch.update(ref, { zoneId, updatedAt: now });
    }
    await batch.commit();
  }
  return { affected: ids.length };
}

// ── Rewards (config CRUD: direct client read/write per `rewards.manage`;
// analytics: the Phase 6 aggregation Callable) ───────────────────────────

interface RewardConfigsResult {
  configs: Array<{ id: string; cashbackAmount: string; probability: number; minOrder: string; expiryDays: number; isActive: boolean; sortOrder: number }>;
  activeProbabilityTotal: number;
  isSpinnable: boolean;
}

async function listRewardConfigs(): Promise<RewardConfigsResult> {
  const snap = await getDocs(query(collection(firebaseFirestore, 'rewardConfigs'), orderBy('sortOrder', 'asc')));
  const configs = snap.docs.map((d) => {
    const data = d.data() as { cashbackAmountPaise: number; probability: number; minOrderPaise: number; expiryDays: number; isActive: boolean; sortOrder: number };
    return {
      id: d.id,
      cashbackAmount: String(paiseToRupees(data.cashbackAmountPaise)),
      probability: data.probability,
      minOrder: String(paiseToRupees(data.minOrderPaise)),
      expiryDays: data.expiryDays,
      isActive: data.isActive,
      sortOrder: data.sortOrder,
    };
  });
  const activeProbabilityTotal = configs.filter((c) => c.isActive).reduce((sum, c) => sum + c.probability, 0);
  return { configs, activeProbabilityTotal, isSpinnable: configs.some((c) => c.isActive) && activeProbabilityTotal === 100 };
}

async function createRewardConfig(payload: {
  cashbackAmount: number;
  probability: number;
  minOrder: number;
  expiryDays: number;
  isActive: boolean;
  sortOrder: number;
}): Promise<void> {
  const now = serverTimestamp();
  await addDoc(collection(firebaseFirestore, 'rewardConfigs'), {
    cashbackAmountPaise: rupeesToPaise(payload.cashbackAmount),
    probability: payload.probability,
    minOrderPaise: rupeesToPaise(payload.minOrder),
    expiryDays: payload.expiryDays,
    isActive: payload.isActive,
    sortOrder: payload.sortOrder,
    createdAt: now,
    updatedAt: now,
  });
}

async function updateRewardConfig(id: string, payload: Record<string, unknown>): Promise<void> {
  await updateDoc(doc(firebaseFirestore, 'rewardConfigs', id), { ...payload, updatedAt: serverTimestamp() });
}

async function deleteRewardConfig(id: string): Promise<void> {
  await deleteDoc(doc(firebaseFirestore, 'rewardConfigs', id));
}

/** Same five default tiers Express's `seed-defaults` endpoint creates (₹5/10/20/30/40/50 — see rewards.types.ts). */
async function seedRewardDefaults(): Promise<void> {
  const DEFAULTS = [
    { cashbackAmount: 5, probability: 35, minOrder: 199, expiryDays: 3, sortOrder: 0 },
    { cashbackAmount: 10, probability: 30, minOrder: 249, expiryDays: 3, sortOrder: 1 },
    { cashbackAmount: 20, probability: 20, minOrder: 349, expiryDays: 5, sortOrder: 2 },
    { cashbackAmount: 30, probability: 10, minOrder: 499, expiryDays: 5, sortOrder: 3 },
    { cashbackAmount: 50, probability: 5, minOrder: 699, expiryDays: 7, sortOrder: 4 },
  ];
  for (const tier of DEFAULTS) {
    await createRewardConfig({ ...tier, isActive: true });
  }
}

async function rewardAnalytics(): Promise<{
  totalSpins: number;
  todaySpins: number;
  couponsGenerated: number;
  couponsRedeemed: number;
  totalCashbackIssued: number;
  mostWonReward: number | null;
}> {
  const result = await getRewardAnalyticsCallable();
  const a = result.data;
  return {
    totalSpins: a.totalSpins,
    todaySpins: a.todaySpins,
    couponsGenerated: a.totalSpins,
    couponsRedeemed: a.redeemedCount,
    totalCashbackIssued: paiseToRupees(a.totalCashbackPaise),
    mostWonReward: a.mostWonTier ? paiseToRupees(a.mostWonTier.cashbackAmountPaise) : null,
  };
}

// ── Image upload — no Cloud Storage integration in this migration (see
// file header); AdminProducts falls back to a manual image-URL input. ────

async function uploadImage(): Promise<string> {
  throw new Error('Image upload is not available in Firebase mode. Paste an image URL instead.');
}

export const firebaseAdminApi = {
  dashboard,
  salesTrend,
  topProducts,
  lowStock,
  listProducts,
  createProduct,
  deleteProduct,
  uploadImage,
  listCategoriesAdmin,
  createCategory,
  deleteCategory,
  listOrders,
  updateOrderStatus,
  listCoupons,
  createCoupon,
  deleteCoupon,
  listCustomers,
  setCustomerActive,
  listZones,
  createZone,
  listPincodes,
  createPincode,
  bulkImportPincodes,
  bulkActionPincodes,
  listRewardConfigs,
  createRewardConfig,
  updateRewardConfig,
  deleteRewardConfig,
  seedRewardDefaults,
  rewardAnalytics,
};
