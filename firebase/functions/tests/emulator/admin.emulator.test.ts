import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db, auth } from '../../src/config/firebaseAdmin';
import { getAdminDashboard, getSalesTrend, getTopProducts } from '../../src/admin/dashboard.function';
import { adminListCustomers, adminSetCustomerActive, adminListStaff } from '../../src/admin/customers.function';
import { adminAdjustInventory } from '../../src/inventory/inventory.function';
import { adminUpsertProduct, adminDeleteProduct } from '../../src/catalog/adminProducts.function';
import { getRewardAnalytics } from '../../src/rewards/rewards.function';
import { adminBulkImportPincodes } from '../../src/delivery/delivery.function';
import { sendNotification } from '../../src/notifications/notifications.function';

/**
 * Real Firestore + Auth emulator integration tests for the Phase 6 admin
 * Callables. Run via `npm run test:emulator`.
 *
 * Every Callable here is invoked in-process via its exported `.run()`
 * method (same style as the Razorpay-specific tests in
 * orders.emulator.test.ts) rather than over the Functions emulator's HTTP
 * transport — there is no outbound network call to fake for any of these
 * functions, so calling `.run()` directly exercises the exact same code
 * path and the exact same live Firestore/Auth emulator transactions a real
 * `httpsCallable` invocation would, with far less setup (no need to mint a
 * real signed-in session with custom claims just to drive `request.auth`).
 * `tests/admin/adminFunctions.test.ts` already covers every permission
 * guard as a plain unit test — this file focuses on real Firestore/Auth
 * state after a successful call.
 */

const ADMIN = { uid: 'admin-emu-1', token: { role: 'ADMIN' } };

function fakeRequest(data?: unknown): CallableRequest {
  return { data, auth: ADMIN } as unknown as CallableRequest;
}

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

afterAll(async () => {
  // No app/client teardown needed — every call here runs in-process
  // against the shared Admin SDK `db`/`auth`, not a client SDK connection.
});

describe('getAdminDashboard / getSalesTrend / getTopProducts — real Firestore aggregation', () => {
  const now = FieldValue.serverTimestamp();

  beforeAll(async () => {
    await Promise.all([
      // isActive: false — the admin product-upsert transaction never checks
      // a category's isActive flag (only that it exists), so this is safe
      // for these tests while keeping it out of the public getCategories()
      // Callable's exact-list assertion in catalog.emulator.test.ts (same
      // shared Firestore emulator project across every *.emulator.test.ts
      // file in one `emulators:exec` run).
      db.doc('categories/dash-cat').set({ name: 'Dash Cat', slug: 'dash-cat', isActive: false, sortOrder: 0, productCount: 1, createdAt: now, updatedAt: now }),
      db.doc('products/dash-product').set({
        name: 'Dashboard Almonds',
        slug: 'dash-product',
        categoryId: 'dash-cat',
        categoryName: 'Dash Cat',
        description: null,
        brandId: null,
        brandName: null,
        images: [],
        gstRatePercent: 5,
        hsnCode: null,
        isActive: true,
        isFeatured: false,
        isBestSeller: false,
        ratingAvg: 0,
        ratingCount: 0,
        metaTitle: null,
        metaDescription: null,
        minPricePaise: 10000,
        maxPricePaise: 10000,
        defaultVariant: null,
        createdAt: now,
        updatedAt: now,
      }),
      db.doc('inventory/DASH-SKU').set({ stock: 2, reserved: 0, lowStockThreshold: 5, isLowStock: true, updatedAt: now }),
    ]);

    const orderRef = db.collection('orders').doc('TSG-DASH-00000001');
    await orderRef.set({
      userId: 'dash-user-1',
      orderNumber: 'TSG-DASH-00000001',
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      paymentMethod: 'COD',
      totalPaise: 50000,
      placedAt: Timestamp.now(),
    });
    await orderRef.collection('items').doc('item-1').set({ productName: 'Dashboard Almonds', quantity: 3, lineTotalPaise: 50000 });
  });

  it('getAdminDashboard reflects real aggregation over seeded orders/products/inventory', async () => {
    const result = (await getAdminDashboard.run(fakeRequest())) as {
      totalOrders: number;
      activeProducts: number;
      lowStockCount: number;
      totalRevenuePaise: number;
    };
    expect(result.totalOrders).toBeGreaterThanOrEqual(1);
    expect(result.activeProducts).toBeGreaterThanOrEqual(1);
    expect(result.lowStockCount).toBeGreaterThanOrEqual(1);
    expect(result.totalRevenuePaise).toBeGreaterThanOrEqual(50000);
  });

  it('getSalesTrend includes the seeded PAID order in today\'s bucket', async () => {
    const result = (await getSalesTrend.run(fakeRequest({ days: 7 }))) as { trend: Array<{ date: string; revenuePaise: number; orderCount: number }> };
    const totalRevenue = result.trend.reduce((sum, t) => sum + t.revenuePaise, 0);
    const totalOrders = result.trend.reduce((sum, t) => sum + t.orderCount, 0);
    expect(totalRevenue).toBeGreaterThanOrEqual(50000);
    expect(totalOrders).toBeGreaterThanOrEqual(1);
  });

  it('getTopProducts includes the seeded order item', async () => {
    const result = (await getTopProducts.run(fakeRequest({ limit: 20, days: 30 }))) as { products: Array<{ productName: string; quantitySold: number }> };
    const dash = result.products.find((p) => p.productName === 'Dashboard Almonds');
    expect(dash?.quantitySold).toBeGreaterThanOrEqual(3);
  });
});

describe('adminAdjustInventory — real transaction against seeded inventory/variant docs', () => {
  beforeAll(async () => {
    const now = FieldValue.serverTimestamp();
    await Promise.all([
      db.doc('inventory/ADJ-SKU').set({ stock: 20, reserved: 2, lowStockThreshold: 5, isLowStock: false, updatedAt: now }),
      db.doc('productVariants/ADJ-SKU').set({ productId: 'dash-product', unitLabel: '500 g', mrpPaise: 12000, pricePaise: 10000, weightGrams: 500, isActive: true, isDefault: true, availableStock: 18, createdAt: now, updatedAt: now }),
    ]);
  });

  it('lowers stock below the threshold and recomputes isLowStock + the denormalized variant availableStock', async () => {
    await adminAdjustInventory.run(fakeRequest({ variantId: 'ADJ-SKU', stock: 3 }));

    const [invSnap, variantSnap] = await Promise.all([db.doc('inventory/ADJ-SKU').get(), db.doc('productVariants/ADJ-SKU').get()]);
    expect(invSnap.data()?.stock).toBe(3);
    expect(invSnap.data()?.isLowStock).toBe(true);
    expect(variantSnap.data()?.availableStock).toBe(1); // stock(3) - reserved(2)
  });

  it('rejects an adjustment for a non-existent inventory doc with not-found', async () => {
    await expect(adminAdjustInventory.run(fakeRequest({ variantId: 'NO-SUCH-SKU', stock: 5 }))).rejects.toMatchObject({
      code: 'not-found',
    } as Partial<HttpsError>);
  });
});

describe('adminUpsertProduct / adminDeleteProduct — real replace-all-variants transaction', () => {
  beforeAll(async () => {
    const now = FieldValue.serverTimestamp();
    // isActive: false for the same cross-file-pollution reason as
    // dash-cat above.
    await db.doc('categories/upsert-cat').set({ name: 'Upsert Cat', slug: 'upsert-cat', isActive: false, sortOrder: 0, productCount: 0, createdAt: now, updatedAt: now });
  });

  it('creates a product with a generated slug, plus its variant and inventory docs', async () => {
    const result = (await adminUpsertProduct.run(
      fakeRequest({
        name: 'Emulator Test Product',
        categoryId: 'upsert-cat',
        images: [],
        variants: [{ sku: 'EMU-SKU-1', unitLabel: '1 kg', mrpPaise: 20000, pricePaise: 18000, stock: 15 }],
      }),
    )) as { slug: string };
    expect(result.slug).toBe('emulator-test-product');

    const [productSnap, variantSnap, inventorySnap] = await Promise.all([
      db.doc(`products/${result.slug}`).get(),
      db.doc('productVariants/EMU-SKU-1').get(),
      db.doc('inventory/EMU-SKU-1').get(),
    ]);
    expect(productSnap.exists).toBe(true);
    expect(productSnap.data()?.minPricePaise).toBe(18000);
    expect(variantSnap.exists).toBe(true);
    expect(inventorySnap.data()?.stock).toBe(15);
  });

  it('editing with a new SKU deletes the old variant+inventory docs and creates fresh ones (faithful "replace-all" port)', async () => {
    await adminUpsertProduct.run(
      fakeRequest({
        slug: 'emulator-test-product',
        name: 'Emulator Test Product',
        categoryId: 'upsert-cat',
        images: [],
        variants: [{ sku: 'EMU-SKU-2', unitLabel: '2 kg', mrpPaise: 38000, pricePaise: 34000, stock: 7 }],
      }),
    );

    const [oldVariant, oldInventory, newVariant] = await Promise.all([
      db.doc('productVariants/EMU-SKU-1').get(),
      db.doc('inventory/EMU-SKU-1').get(),
      db.doc('productVariants/EMU-SKU-2').get(),
    ]);
    expect(oldVariant.exists).toBe(false);
    expect(oldInventory.exists).toBe(false);
    expect(newVariant.exists).toBe(true);
  });

  it('adminDeleteProduct removes the product and every remaining variant+inventory doc', async () => {
    await adminDeleteProduct.run(fakeRequest({ slug: 'emulator-test-product' }));

    const [productSnap, variantSnap, inventorySnap] = await Promise.all([
      db.doc('products/emulator-test-product').get(),
      db.doc('productVariants/EMU-SKU-2').get(),
      db.doc('inventory/EMU-SKU-2').get(),
    ]);
    expect(productSnap.exists).toBe(false);
    expect(variantSnap.exists).toBe(false);
    expect(inventorySnap.exists).toBe(false);
  });
});

describe('adminBulkImportPincodes — real batched writes to serviceablePincodes', () => {
  beforeAll(async () => {
    const now = FieldValue.serverTimestamp();
    await db.doc('deliveryZones/emu-zone').set({ name: 'Emulator Zone', description: null, deliveryChargePaise: 3000, freeDeliveryLimitPaise: 0, minEtaMinutes: 20, maxEtaMinutes: 45, isActive: true, createdAt: now, updatedAt: now });
  });

  it('creates serviceablePincodes docs for every valid new code', async () => {
    const result = (await adminBulkImportPincodes.run(
      fakeRequest({ items: [{ code: '600001' }, { code: '600002' }], zoneId: 'emu-zone', mode: 'skip' }),
    )) as { stats: { added: number } };
    expect(result.stats.added).toBe(2);

    const snap = await db.doc('serviceablePincodes/600001').get();
    expect(snap.data()?.zoneId).toBe('emu-zone');
  });

  it('skip mode leaves an already-imported code untouched on a second import', async () => {
    const result = (await adminBulkImportPincodes.run(
      fakeRequest({ items: [{ code: '600001' }], zoneId: 'emu-zone', mode: 'skip' }),
    )) as { stats: { skipped: number; added: number } };
    expect(result.stats.skipped).toBe(1);
    expect(result.stats.added).toBe(0);
  });
});

describe('getRewardAnalytics — real aggregation over seeded rewardCoupons', () => {
  beforeAll(async () => {
    await Promise.all([
      db.doc('rewardCoupons/EMU-SPIN-1').set({ code: 'EMU-SPIN-1', userId: 'reward-user-1', cashbackAmountPaise: 500, minOrderPaise: 19900, status: 'REDEEMED', expiresAt: Timestamp.now(), redeemedOrderId: 'TSG-1', redeemedAt: Timestamp.now(), createdAt: Timestamp.now() }),
      db.doc('rewardCoupons/EMU-SPIN-2').set({ code: 'EMU-SPIN-2', userId: 'reward-user-2', cashbackAmountPaise: 500, minOrderPaise: 19900, status: 'ACTIVE', expiresAt: Timestamp.now(), redeemedOrderId: null, redeemedAt: null, createdAt: Timestamp.now() }),
    ]);
  });

  it('counts total spins, redeemed coupons, and identifies the most-won tier', async () => {
    const result = (await getRewardAnalytics.run(fakeRequest())) as {
      totalSpins: number;
      redeemedCount: number;
      mostWonTier: { cashbackAmountPaise: number; count: number } | null;
    };
    expect(result.totalSpins).toBeGreaterThanOrEqual(2);
    expect(result.redeemedCount).toBeGreaterThanOrEqual(1);
    expect(result.mostWonTier?.cashbackAmountPaise).toBe(500);
  });
});

describe('adminListCustomers / adminSetCustomerActive / adminListStaff — real Auth emulator users', () => {
  let customerUid: string;
  let staffUid: string;

  beforeAll(async () => {
    const customer = await auth.createUser({ email: uniqueEmail('admin-emu-customer'), password: 'Password123!', displayName: 'Emulator Customer' });
    customerUid = customer.uid;
    await auth.setCustomUserClaims(customerUid, { role: 'CUSTOMER' });

    const staff = await auth.createUser({ email: uniqueEmail('admin-emu-staff'), password: 'Password123!' });
    staffUid = staff.uid;
    await auth.setCustomUserClaims(staffUid, { role: 'STAFF', permissions: ['orders.manage'] });
  });

  it('adminListCustomers finds the seeded CUSTOMER by uid, excluding STAFF', async () => {
    const result = (await adminListCustomers.run(fakeRequest({}))) as { customers: Array<{ uid: string }> };
    const uids = result.customers.map((c) => c.uid);
    expect(uids).toContain(customerUid);
    expect(uids).not.toContain(staffUid);
  });

  it('adminListCustomers filters by search substring against email/displayName', async () => {
    const result = (await adminListCustomers.run(fakeRequest({ search: 'Emulator Customer' }))) as { customers: Array<{ uid: string }> };
    expect(result.customers.map((c) => c.uid)).toContain(customerUid);
  });

  it('adminSetCustomerActive disables the real Auth user', async () => {
    await adminSetCustomerActive.run(fakeRequest({ uid: customerUid, isActive: false }));
    const record = await auth.getUser(customerUid);
    expect(record.disabled).toBe(true);
  });

  it('adminSetCustomerActive rejects a non-existent uid with not-found', async () => {
    await expect(adminSetCustomerActive.run(fakeRequest({ uid: 'no-such-uid-at-all', isActive: true }))).rejects.toMatchObject({
      code: 'not-found',
    } as Partial<HttpsError>);
  });

  it('adminListStaff finds the seeded STAFF user with their permissions, excluding the CUSTOMER', async () => {
    const result = (await adminListStaff.run(fakeRequest())) as { staff: Array<{ uid: string; permissions: string[] }> };
    const entry = result.staff.find((s) => s.uid === staffUid);
    expect(entry?.permissions).toEqual(['orders.manage']);
    expect(result.staff.map((s) => s.uid)).not.toContain(customerUid);
  });
});

describe('sendNotification — real Firestore write + Auth existence check', () => {
  let targetUid: string;

  beforeAll(async () => {
    const target = await auth.createUser({ email: uniqueEmail('admin-emu-notify-target') });
    targetUid = target.uid;
  });

  it('writes a notification doc under the target user\'s subcollection', async () => {
    const result = (await sendNotification.run(fakeRequest({ targetUid, title: 'Order shipped', body: 'Your order is on the way.' }))) as { id: string };
    const snap = await db.collection('notifications').doc(targetUid).collection('items').doc(result.id).get();
    expect(snap.exists).toBe(true);
    expect(snap.data()?.title).toBe('Order shipped');
    expect(snap.data()?.isRead).toBe(false);
  });

  it('rejects a targetUid that does not exist in Firebase Auth', async () => {
    await expect(sendNotification.run(fakeRequest({ targetUid: 'no-such-uid-at-all', title: 'Hi', body: 'Hello' }))).rejects.toMatchObject({
      code: 'not-found',
    } as Partial<HttpsError>);
  });
});
