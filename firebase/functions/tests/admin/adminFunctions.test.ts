import { describe, it, expect } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import { getAdminDashboard, getSalesTrend, getTopProducts } from '../../src/admin/dashboard.function';
import { adminListCustomers, adminSetCustomerActive, adminListStaff } from '../../src/admin/customers.function';
import { adminAdjustInventory } from '../../src/inventory/inventory.function';
import { adminUpsertProduct, adminDeleteProduct } from '../../src/catalog/adminProducts.function';
import { getRewardAnalytics } from '../../src/rewards/rewards.function';
import { adminBulkImportPincodes } from '../../src/delivery/delivery.function';
import { sendNotification } from '../../src/notifications/notifications.function';

function fakeRequest(auth: { uid: string; token: Record<string, unknown> } | undefined, data?: unknown): CallableRequest {
  return { data, auth } as unknown as CallableRequest;
}

const CUSTOMER = { uid: 'u1', token: { role: 'CUSTOMER' } };
const STAFF_NO_PERMS = { uid: 'staff-1', token: { role: 'STAFF', permissions: [] } };

/**
 * Every admin Callable added in Phase 6 must reject BOTH an unauthenticated
 * caller (unauthenticated) AND a signed-in caller lacking the specific
 * permission (permission-denied) — these guards short-circuit before any
 * Firestore/Auth-SDK call, so they're safe as plain unit tests. Full
 * transactional/aggregation behavior is covered by the emulator
 * integration tests.
 */
describe('admin Callable Functions — permission guards', () => {
  const cases: Array<{ name: string; fn: { run: (r: CallableRequest) => Promise<unknown> }; data?: unknown; deniedAs?: typeof CUSTOMER }> = [
    { name: 'getAdminDashboard', fn: getAdminDashboard },
    { name: 'getSalesTrend', fn: getSalesTrend },
    { name: 'getTopProducts', fn: getTopProducts },
    { name: 'adminListCustomers', fn: adminListCustomers },
    { name: 'adminSetCustomerActive', fn: adminSetCustomerActive, data: { uid: 'x', isActive: true } },
    { name: 'adminListStaff', fn: adminListStaff },
    { name: 'adminAdjustInventory', fn: adminAdjustInventory, data: { variantId: 'ALM-500', stock: 10 } },
    {
      name: 'adminUpsertProduct',
      fn: adminUpsertProduct,
      data: { name: 'Test', categoryId: 'cat', variants: [{ sku: 'X', unitLabel: '1', mrpPaise: 100, pricePaise: 90 }] },
    },
    { name: 'adminDeleteProduct', fn: adminDeleteProduct, data: { slug: 'x' } },
    { name: 'getRewardAnalytics', fn: getRewardAnalytics },
    { name: 'adminBulkImportPincodes', fn: adminBulkImportPincodes, data: { items: [{ code: '500001' }] } },
    { name: 'sendNotification', fn: sendNotification, data: { targetUid: 'u1', title: 'Hi', body: 'Hello' } },
  ];

  for (const { name, fn, data } of cases) {
    it(`${name} rejects an unauthenticated caller`, async () => {
      await expect(fn.run(fakeRequest(undefined, data))).rejects.toBeInstanceOf(HttpsError);
    });

    it(`${name} rejects a signed-in CUSTOMER (no permission)`, async () => {
      try {
        await fn.run(fakeRequest(CUSTOMER, data));
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpsError);
        expect((err as HttpsError).code).toBe('permission-denied');
      }
    });

    it(`${name} rejects a STAFF caller without the required permission`, async () => {
      try {
        await fn.run(fakeRequest(STAFF_NO_PERMS, data));
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpsError);
        expect((err as HttpsError).code).toBe('permission-denied');
      }
    });
  }
});

describe('adminAdjustInventory — input validation', () => {
  const ADMIN = { uid: 'admin-1', token: { role: 'ADMIN' } };

  it('rejects a negative stock value with invalid-argument (even for an authorized admin)', async () => {
    try {
      await adminAdjustInventory.run(fakeRequest(ADMIN, { variantId: 'ALM-500', stock: -1 }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });

  it('accepts stock/lowStockThreshold sent as null (client wire-protocol quirk, same as every other phase)', async () => {
    await expect(
      adminAdjustInventory.run(fakeRequest(ADMIN, { variantId: 'ALM-500', stock: null, lowStockThreshold: null })),
    ).resolves.toBeDefined();
  });
});

describe('adminUpsertProduct — input validation', () => {
  const ADMIN = { uid: 'admin-1', token: { role: 'ADMIN' } };

  it('rejects an empty variants array with invalid-argument', async () => {
    try {
      await adminUpsertProduct.run(fakeRequest(ADMIN, { name: 'Test', categoryId: 'cat', variants: [] }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });
});

describe('sendNotification — input validation', () => {
  const ADMIN = { uid: 'admin-1', token: { role: 'ADMIN' } };

  it('rejects a missing title with invalid-argument', async () => {
    try {
      await sendNotification.run(fakeRequest(ADMIN, { targetUid: 'u1', body: 'Hello' }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });
});
