import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

/**
 * Firestore Security Rules tests for the Phase 1 default-deny foundation.
 *
 * Run via `npm run test:rules` (wraps this file in
 * `firebase emulators:exec --only firestore`) — requires the Firestore
 * emulator, NOT covered by the plain `npm test` unit-test run. See
 * firebase/functions/package.json and firebase/README.md.
 *
 * Every production collection this project will eventually use is still
 * commented out in firestore.rules (Phase 1 scope). `mainEnv` below loads
 * the real, committed firestore.rules file and exercises exactly what is
 * live right now: the default-deny catch-all. `helperEnv` loads a small,
 * self-contained rules document (inline here, not the committed file) whose
 * only purpose is to exercise the isAdmin()/isOwner()-style helper-function
 * logic end-to-end against real custom claims — the same helper functions
 * that are already written into firestore.rules and will be reused as each
 * production collection's rules are uncommented in a later phase.
 */

const MAIN_PROJECT_ID = 'demo-tsgecart-rules-main';
const HELPER_PROJECT_ID = 'demo-tsgecart-rules-helper';

let mainEnv: RulesTestEnvironment;
let helperEnv: RulesTestEnvironment;

const HELPER_RULES = `
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      function isSignedIn() { return request.auth != null; }
      function callerRole() { return isSignedIn() ? request.auth.token.get('role', null) : null; }
      function isAdmin() { return isSignedIn() && callerRole() == 'ADMIN'; }
      function isOwner(userId) { return isSignedIn() && request.auth.uid == userId; }
      function isDeliveryPartner() { return isSignedIn() && callerRole() == 'DELIVERY_PARTNER'; }

      match /_rulesTestScratch/{docId} {
        allow read: if isAdmin() || isOwner(resource.data.userId);
        allow write: if isAdmin();
      }
      match /_rulesTestDeliveryScratch/{docId} {
        allow read: if isAdmin() || isDeliveryPartner();
        allow write: if isAdmin();
      }
      match /{document=**} {
        allow read, write: if false;
      }
    }
  }
`;

beforeAll(async () => {
  const realRules = readFileSync(join(__dirname, '..', '..', 'firestore.rules'), 'utf8');
  [mainEnv, helperEnv] = await Promise.all([
    initializeTestEnvironment({
      projectId: MAIN_PROJECT_ID,
      firestore: { rules: realRules, host: 'localhost', port: 8080 },
    }),
    initializeTestEnvironment({
      projectId: HELPER_PROJECT_ID,
      firestore: { rules: HELPER_RULES, host: 'localhost', port: 8080 },
    }),
  ]);
});

afterAll(async () => {
  await Promise.all([mainEnv?.cleanup(), helperEnv?.cleanup()]);
});

beforeEach(async () => {
  await Promise.all([mainEnv.clearFirestore(), helperEnv.clearFirestore()]);
});

describe('firestore.rules — default-deny foundation (real committed rules file)', () => {
  it('denies an anonymous read of any unknown collection', async () => {
    const anon = mainEnv.unauthenticatedContext();
    await assertFails(anon.firestore().doc('someUnknownCollection/doc1').get());
  });

  it('denies an anonymous write to any unknown collection', async () => {
    const anon = mainEnv.unauthenticatedContext();
    await assertFails(anon.firestore().doc('someUnknownCollection/doc1').set({ hello: 'world' }));
  });

  it('denies an authenticated (no-claims) user reading an unknown collection', async () => {
    const user = mainEnv.authenticatedContext('user-1');
    await assertFails(user.firestore().doc('anotherUnknownCollection/doc1').get());
  });

  it('denies an authenticated (no-claims) user writing an unknown collection', async () => {
    const user = mainEnv.authenticatedContext('user-1');
    await assertFails(user.firestore().doc('anotherUnknownCollection/doc1').set({ quantity: 1 }));
  });

  it('denies access even to a user with a real ADMIN claim, for collections not yet opened', async () => {
    // Having a genuine ADMIN custom claim does not bypass the default-deny
    // catch-all for paths with no explicit `match` block yet — every
    // collection must be deliberately opened, never implicitly available.
    const admin = mainEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    await assertFails(admin.firestore().doc('someFutureCollection/doc1').get());
  });

  it('a document field claiming admin-ness grants no access (fake admin fields do not work)', async () => {
    await mainEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await adminCtx
        .firestore()
        .doc('someUnknownCollection/fakeAdminDoc')
        .set({ role: 'ADMIN', isAdmin: true, admin: true, userId: 'nobody' });
    });

    const user = mainEnv.authenticatedContext('user-2');
    await assertFails(user.firestore().doc('someUnknownCollection/fakeAdminDoc').get());

    const anon = mainEnv.unauthenticatedContext();
    await assertFails(anon.firestore().doc('someUnknownCollection/fakeAdminDoc').get());
  });

  it('an arbitrary custom-claims shape (not the real role/permissions claims) confers no access', async () => {
    // A caller whose token has an `isAdmin: true`-style claim instead of
    // the real `role: 'ADMIN'` shape the rules helpers check for must not
    // gain access beyond what default-deny already denies to everyone.
    const impostor = mainEnv.authenticatedContext('impostor-1', { isAdmin: true, admin: true });
    await assertFails(impostor.firestore().doc('someUnknownCollection/doc1').get());
  });
});

describe('firestore.rules — products/categories (Phase 3, real committed rules file)', () => {
  const activeProduct = {
    name: 'Fresh Almonds',
    slug: 'fresh-almonds',
    isActive: true,
    isFeatured: false,
    isBestSeller: false,
    categoryId: 'dry-fruits',
  };
  const inactiveProduct = { ...activeProduct, slug: 'discontinued-item', isActive: false };
  const activeCategory = { name: 'Dry Fruits', slug: 'dry-fruits', isActive: true, sortOrder: 0 };
  const inactiveCategory = { ...activeCategory, slug: 'seasonal-old', isActive: false };

  beforeEach(async () => {
    await mainEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const db = adminCtx.firestore();
      await Promise.all([
        db.doc('products/fresh-almonds').set(activeProduct),
        db.doc('products/discontinued-item').set(inactiveProduct),
        db.doc('categories/dry-fruits').set(activeCategory),
        db.doc('categories/seasonal-old').set(inactiveCategory),
      ]);
    });
  });

  it('an anonymous caller can read an active product', async () => {
    const anon = mainEnv.unauthenticatedContext();
    await assertSucceeds(anon.firestore().doc('products/fresh-almonds').get());
  });

  it('an anonymous caller can read an active category', async () => {
    const anon = mainEnv.unauthenticatedContext();
    await assertSucceeds(anon.firestore().doc('categories/dry-fruits').get());
  });

  it('an anonymous caller cannot read an inactive product', async () => {
    const anon = mainEnv.unauthenticatedContext();
    await assertFails(anon.firestore().doc('products/discontinued-item').get());
  });

  it('an anonymous caller cannot read an inactive category', async () => {
    const anon = mainEnv.unauthenticatedContext();
    await assertFails(anon.firestore().doc('categories/seasonal-old').get());
  });

  it('STAFF/ADMIN can read an inactive product (admin catalog UI needs this)', async () => {
    const admin = mainEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    await assertSucceeds(admin.firestore().doc('products/discontinued-item').get());
  });

  it('an ADMIN caller can create/update/delete a product', async () => {
    const admin = mainEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    const doc = admin.firestore().doc('products/new-item');
    await assertSucceeds(doc.set({ ...activeProduct, slug: 'new-item' }));
    await assertSucceeds(doc.update({ isFeatured: true }));
    await assertSucceeds(doc.delete());
  });

  it('an ADMIN caller can write a category', async () => {
    const admin = mainEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    await assertSucceeds(admin.firestore().doc('categories/new-cat').set({ ...activeCategory, slug: 'new-cat' }));
  });

  it('a STAFF caller holding the products.manage permission can write a product (claims, not role alone, decide access)', async () => {
    const staff = mainEnv.authenticatedContext('staff-1', {
      role: 'STAFF',
      permissions: ['products.manage'],
    });
    await assertSucceeds(staff.firestore().doc('products/staff-item').set({ ...activeProduct, slug: 'staff-item' }));
  });

  it('a STAFF caller WITHOUT the products.manage permission cannot write a product', async () => {
    const staff = mainEnv.authenticatedContext('staff-2', { role: 'STAFF', permissions: ['orders.manage'] });
    await assertFails(staff.firestore().doc('products/staff-item-2').set({ ...activeProduct, slug: 'staff-item-2' }));
  });

  it('a signed-in CUSTOMER cannot write a product', async () => {
    const customer = mainEnv.authenticatedContext('customer-1', { role: 'CUSTOMER' });
    await assertFails(
      customer.firestore().doc('products/fresh-almonds').update({ isFeatured: true }),
    );
  });

  it('an anonymous caller cannot write a product', async () => {
    const anon = mainEnv.unauthenticatedContext();
    await assertFails(anon.firestore().doc('products/fresh-almonds').update({ isFeatured: true }));
  });

  it('a CUSTOMER cannot write a category', async () => {
    const customer = mainEnv.authenticatedContext('customer-1', { role: 'CUSTOMER' });
    await assertFails(customer.firestore().doc('categories/dry-fruits').update({ sortOrder: 99 }));
  });
});

describe('firestore.rules — productVariants (Phase 4, real committed rules file)', () => {
  const activeVariant = { productId: 'fresh-almonds', unitLabel: '500 g', isActive: true, isDefault: true };
  const inactiveVariant = { ...activeVariant, isActive: false };

  beforeEach(async () => {
    await mainEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const db = adminCtx.firestore();
      await Promise.all([
        db.doc('productVariants/ALM-500').set(activeVariant),
        db.doc('productVariants/DISCONTINUED-SKU').set(inactiveVariant),
      ]);
    });
  });

  it('an anonymous caller can read an active variant', async () => {
    const anon = mainEnv.unauthenticatedContext();
    await assertSucceeds(anon.firestore().doc('productVariants/ALM-500').get());
  });

  it('an anonymous caller cannot read an inactive variant', async () => {
    const anon = mainEnv.unauthenticatedContext();
    await assertFails(anon.firestore().doc('productVariants/DISCONTINUED-SKU').get());
  });

  it('STAFF/ADMIN can read an inactive variant', async () => {
    const admin = mainEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    await assertSucceeds(admin.firestore().doc('productVariants/DISCONTINUED-SKU').get());
  });

  it('an ADMIN caller can write a variant', async () => {
    const admin = mainEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    await assertSucceeds(admin.firestore().doc('productVariants/NEW-SKU').set({ ...activeVariant }));
  });

  it('a CUSTOMER cannot write a variant', async () => {
    const customer = mainEnv.authenticatedContext('customer-1', { role: 'CUSTOMER' });
    await assertFails(customer.firestore().doc('productVariants/ALM-500').update({ isFeatured: true }));
  });
});

describe('firestore.rules — inventory (Phase 4, real committed rules file)', () => {
  beforeEach(async () => {
    await mainEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await adminCtx.firestore().doc('inventory/ALM-500').set({ stock: 20, reserved: 3, lowStockThreshold: 5 });
    });
  });

  it('an anonymous caller cannot read inventory', async () => {
    const anon = mainEnv.unauthenticatedContext();
    await assertFails(anon.firestore().doc('inventory/ALM-500').get());
  });

  it('a signed-in CUSTOMER cannot read inventory', async () => {
    const customer = mainEnv.authenticatedContext('customer-1', { role: 'CUSTOMER' });
    await assertFails(customer.firestore().doc('inventory/ALM-500').get());
  });

  it('STAFF WITHOUT inventory.manage cannot read inventory', async () => {
    const staff = mainEnv.authenticatedContext('staff-1', { role: 'STAFF', permissions: ['products.manage'] });
    await assertFails(staff.firestore().doc('inventory/ALM-500').get());
  });

  it('STAFF WITH inventory.manage can read inventory', async () => {
    const staff = mainEnv.authenticatedContext('staff-2', { role: 'STAFF', permissions: ['inventory.manage'] });
    await assertSucceeds(staff.firestore().doc('inventory/ALM-500').get());
  });

  it('an ADMIN can read inventory (implicitly holds every permission)', async () => {
    const admin = mainEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    await assertSucceeds(admin.firestore().doc('inventory/ALM-500').get());
  });

  it('NO ONE can write inventory directly — not even an ADMIN — it is Function-only', async () => {
    const admin = mainEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    await assertFails(admin.firestore().doc('inventory/ALM-500').update({ stock: 999 }));
  });
});

describe('firestore.rules — carts (Phase 4, real committed rules file)', () => {
  beforeEach(async () => {
    await mainEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const db = adminCtx.firestore();
      await db.doc('carts/user-1').set({ updatedAt: new Date() });
      await db.doc('carts/user-1/items/ALM-500').set({ variantId: 'ALM-500', quantity: 2 });
    });
  });

  it('the cart owner can read their own cart', async () => {
    const owner = mainEnv.authenticatedContext('user-1');
    await assertSucceeds(owner.firestore().doc('carts/user-1').get());
  });

  it('the cart owner can read their own cart items', async () => {
    const owner = mainEnv.authenticatedContext('user-1');
    await assertSucceeds(owner.firestore().doc('carts/user-1/items/ALM-500').get());
  });

  it('a different signed-in user cannot read someone else\'s cart', async () => {
    const stranger = mainEnv.authenticatedContext('user-2');
    await assertFails(stranger.firestore().doc('carts/user-1').get());
  });

  it('a different signed-in user cannot read someone else\'s cart items', async () => {
    const stranger = mainEnv.authenticatedContext('user-2');
    await assertFails(stranger.firestore().doc('carts/user-1/items/ALM-500').get());
  });

  it('an anonymous caller cannot read any cart', async () => {
    const anon = mainEnv.unauthenticatedContext();
    await assertFails(anon.firestore().doc('carts/user-1').get());
  });

  it('even the cart owner cannot write their cart directly — it is Function-only', async () => {
    const owner = mainEnv.authenticatedContext('user-1');
    await assertFails(owner.firestore().doc('carts/user-1/items/ALM-500').update({ quantity: 99 }));
  });

  it('even an ADMIN cannot write someone else\'s cart directly', async () => {
    const admin = mainEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    await assertFails(admin.firestore().doc('carts/user-1/items/ALM-500').update({ quantity: 99 }));
  });
});

describe('firestore.rules — wishlists (Phase 4, real committed rules file)', () => {
  beforeEach(async () => {
    await mainEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await adminCtx.firestore().doc('wishlists/user-1/items/fresh-almonds').set({ addedAt: new Date() });
    });
  });

  it('the owner can read their own wishlist item', async () => {
    const owner = mainEnv.authenticatedContext('user-1');
    await assertSucceeds(owner.firestore().doc('wishlists/user-1/items/fresh-almonds').get());
  });

  it('the owner can add a wishlist item directly (no Function required)', async () => {
    const owner = mainEnv.authenticatedContext('user-1');
    await assertSucceeds(owner.firestore().doc('wishlists/user-1/items/cashew-nuts').set({ addedAt: new Date() }));
  });

  it('the owner can remove a wishlist item directly', async () => {
    const owner = mainEnv.authenticatedContext('user-1');
    await assertSucceeds(owner.firestore().doc('wishlists/user-1/items/fresh-almonds').delete());
  });

  it('a different signed-in user cannot read someone else\'s wishlist', async () => {
    const stranger = mainEnv.authenticatedContext('user-2');
    await assertFails(stranger.firestore().doc('wishlists/user-1/items/fresh-almonds').get());
  });

  it('a different signed-in user cannot write to someone else\'s wishlist', async () => {
    const stranger = mainEnv.authenticatedContext('user-2');
    await assertFails(stranger.firestore().doc('wishlists/user-1/items/hacked').set({ addedAt: new Date() }));
  });

  it('an anonymous caller cannot read or write any wishlist', async () => {
    const anonDb = mainEnv.unauthenticatedContext().firestore();
    await assertFails(anonDb.doc('wishlists/user-1/items/fresh-almonds').get());
    await assertFails(anonDb.doc('wishlists/user-1/items/anonymous-add').set({ addedAt: new Date() }));
  });
});

describe('firestore.rules — addresses (Phase 4, real committed rules file)', () => {
  beforeEach(async () => {
    await mainEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await adminCtx.firestore().doc('addresses/addr-1').set({ userId: 'user-1', line1: '123 Main St' });
    });
  });

  it('the owner can read their own address', async () => {
    const owner = mainEnv.authenticatedContext('user-1');
    await assertSucceeds(owner.firestore().doc('addresses/addr-1').get());
  });

  it('a different signed-in user cannot read someone else\'s address', async () => {
    const stranger = mainEnv.authenticatedContext('user-2');
    await assertFails(stranger.firestore().doc('addresses/addr-1').get());
  });

  it('an anonymous caller cannot read any address', async () => {
    const anon = mainEnv.unauthenticatedContext();
    await assertFails(anon.firestore().doc('addresses/addr-1').get());
  });

  it('even the owner cannot write their address directly — it is Function-only (default-exclusivity invariant)', async () => {
    const owner = mainEnv.authenticatedContext('user-1');
    await assertFails(owner.firestore().doc('addresses/addr-1').update({ isDefault: true }));
  });

  it('a stranger cannot fake ownership by writing their own uid onto a new address doc — write is Function-only regardless', async () => {
    const stranger = mainEnv.authenticatedContext('user-2');
    await assertFails(
      stranger.firestore().doc('addresses/addr-2').set({ userId: 'user-2', line1: 'Fake Address' }),
    );
  });
});

describe('firestore.rules — delivery zones / serviceable pincodes (Phase 5, real committed rules file)', () => {
  beforeEach(async () => {
    await mainEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const db = adminCtx.firestore();
      await db.doc('deliveryZones/zone-hyd').set({ name: 'Hyderabad Core', deliveryChargePaise: 3000, isActive: true });
      await db.doc('serviceablePincodes/500001').set({ city: 'Hyderabad', zoneId: 'zone-hyd', isServiceable: true });
    });
  });

  it('an anonymous caller can read a delivery zone (pre-auth checkout-eligibility display)', async () => {
    const anon = mainEnv.unauthenticatedContext();
    await assertSucceeds(anon.firestore().doc('deliveryZones/zone-hyd').get());
  });

  it('an anonymous caller can read a serviceable pincode', async () => {
    const anon = mainEnv.unauthenticatedContext();
    await assertSucceeds(anon.firestore().doc('serviceablePincodes/500001').get());
  });

  it('a signed-in CUSTOMER cannot write a delivery zone', async () => {
    const customer = mainEnv.authenticatedContext('customer-1', { role: 'CUSTOMER' });
    await assertFails(customer.firestore().doc('deliveryZones/zone-hyd').update({ deliveryChargePaise: 0 }));
  });

  it('STAFF WITH delivery.manage can write a serviceable pincode (newly added pincodes work immediately)', async () => {
    const staff = mainEnv.authenticatedContext('staff-1', { role: 'STAFF', permissions: ['delivery.manage'] });
    await assertSucceeds(staff.firestore().doc('serviceablePincodes/500081').set({ city: 'Hyderabad', zoneId: 'zone-hyd', isServiceable: true }));
  });

  it('STAFF WITHOUT delivery.manage cannot write a serviceable pincode', async () => {
    const staff = mainEnv.authenticatedContext('staff-2', { role: 'STAFF', permissions: ['products.manage'] });
    await assertFails(staff.firestore().doc('serviceablePincodes/500082').set({ city: 'Hyderabad', zoneId: 'zone-hyd', isServiceable: true }));
  });
});

describe('firestore.rules — coupons (Phase 5, real committed rules file)', () => {
  beforeEach(async () => {
    await mainEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const db = adminCtx.firestore();
      await db.doc('coupons/SAVE10').set({ type: 'PERCENTAGE', value: 10, isActive: true });
      await db.doc('couponUsages/usage-1').set({ couponCode: 'SAVE10', userId: 'user-1', orderId: 'TSG-1' });
    });
  });

  it('an anonymous caller cannot read a coupon (never listable to a customer)', async () => {
    const anon = mainEnv.unauthenticatedContext();
    await assertFails(anon.firestore().doc('coupons/SAVE10').get());
  });

  it('a signed-in CUSTOMER cannot read a coupon directly — resolved only via the validateCoupon Callable', async () => {
    const customer = mainEnv.authenticatedContext('customer-1', { role: 'CUSTOMER' });
    await assertFails(customer.firestore().doc('coupons/SAVE10').get());
  });

  it('STAFF WITH coupons.manage can read and write a coupon (admin coupon-list UI)', async () => {
    const staff = mainEnv.authenticatedContext('staff-1', { role: 'STAFF', permissions: ['coupons.manage'] });
    const db = staff.firestore();
    await assertSucceeds(db.doc('coupons/SAVE10').get());
    await assertSucceeds(db.doc('coupons/NEW20').set({ type: 'FLAT', value: 2000, isActive: true }));
  });

  it('STAFF WITHOUT coupons.manage cannot read a coupon', async () => {
    const staff = mainEnv.authenticatedContext('staff-2', { role: 'STAFF', permissions: ['products.manage'] });
    await assertFails(staff.firestore().doc('coupons/SAVE10').get());
  });

  it('the owner can read their own couponUsages row', async () => {
    const owner = mainEnv.authenticatedContext('user-1');
    await assertSucceeds(owner.firestore().doc('couponUsages/usage-1').get());
  });

  it('a different user cannot read someone else\'s couponUsages row', async () => {
    const stranger = mainEnv.authenticatedContext('user-2');
    await assertFails(stranger.firestore().doc('couponUsages/usage-1').get());
  });

  it('NO ONE can write couponUsages directly — not even an ADMIN — it is order-creation Function-only', async () => {
    const admin = mainEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    await assertFails(admin.firestore().doc('couponUsages/usage-2').set({ couponCode: 'SAVE10', userId: 'admin-1', orderId: 'TSG-2' }));
  });
});

describe('firestore.rules — reward-spin wheel (Phase 5, real committed rules file)', () => {
  beforeEach(async () => {
    await mainEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const db = adminCtx.firestore();
      await db.doc('rewardConfigs/tier-5').set({ cashbackAmountPaise: 500, probability: 40, isActive: true });
      await db.doc('rewardCoupons/SPIN-ABCD1234').set({ userId: 'user-1', cashbackAmountPaise: 500, status: 'ACTIVE' });
    });
  });

  it('a signed-in CUSTOMER cannot read rewardConfigs directly (probability must never reach a customer)', async () => {
    const customer = mainEnv.authenticatedContext('customer-1', { role: 'CUSTOMER' });
    await assertFails(customer.firestore().doc('rewardConfigs/tier-5').get());
  });

  it('STAFF WITH rewards.manage can read and write rewardConfigs', async () => {
    const staff = mainEnv.authenticatedContext('staff-1', { role: 'STAFF', permissions: ['rewards.manage'] });
    const db = staff.firestore();
    await assertSucceeds(db.doc('rewardConfigs/tier-5').get());
    await assertSucceeds(db.doc('rewardConfigs/tier-10').set({ cashbackAmountPaise: 1000, probability: 25, isActive: true }));
  });

  it('the owner can read their own reward coupon', async () => {
    const owner = mainEnv.authenticatedContext('user-1');
    await assertSucceeds(owner.firestore().doc('rewardCoupons/SPIN-ABCD1234').get());
  });

  it('STAFF/ADMIN can read any reward coupon', async () => {
    const admin = mainEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    await assertSucceeds(admin.firestore().doc('rewardCoupons/SPIN-ABCD1234').get());
  });

  it('a different signed-in user cannot read someone else\'s reward coupon', async () => {
    const stranger = mainEnv.authenticatedContext('user-2');
    await assertFails(stranger.firestore().doc('rewardCoupons/SPIN-ABCD1234').get());
  });

  it('NO ONE can write a reward coupon directly — not even the owner — spin/redemption is Function-only', async () => {
    const owner = mainEnv.authenticatedContext('user-1');
    await assertFails(owner.firestore().doc('rewardCoupons/SPIN-ABCD1234').update({ status: 'REDEEMED' }));
  });
});

describe('firestore.rules — orders / order items / status history / payment records (Phase 5, real committed rules file)', () => {
  beforeEach(async () => {
    await mainEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const db = adminCtx.firestore();
      await db.doc('orders/TSG-260719-00000001').set({ userId: 'user-1', status: 'CONFIRMED' });
      await db.doc('orders/TSG-260719-00000001/items/item-1').set({ variantId: 'ALM-500', quantity: 2 });
      await db.doc('orders/TSG-260719-00000001/statusHistory/hist-1').set({ status: 'CONFIRMED', note: 'Order placed' });
      await db.doc('paymentRecords/TSG-260719-00000001').set({ userId: 'user-1', method: 'COD', status: 'PENDING' });
    });
  });

  it('the order owner can read their own order', async () => {
    const owner = mainEnv.authenticatedContext('user-1');
    await assertSucceeds(owner.firestore().doc('orders/TSG-260719-00000001').get());
  });

  it('the order owner can read their own order items', async () => {
    const owner = mainEnv.authenticatedContext('user-1');
    await assertSucceeds(owner.firestore().doc('orders/TSG-260719-00000001/items/item-1').get());
  });

  it('the order owner can read their own order status history (order timeline)', async () => {
    const owner = mainEnv.authenticatedContext('user-1');
    await assertSucceeds(owner.firestore().doc('orders/TSG-260719-00000001/statusHistory/hist-1').get());
  });

  it('the order owner can read their own payment record (payment status)', async () => {
    const owner = mainEnv.authenticatedContext('user-1');
    await assertSucceeds(owner.firestore().doc('paymentRecords/TSG-260719-00000001').get());
  });

  it('a different signed-in user cannot read someone else\'s order', async () => {
    const stranger = mainEnv.authenticatedContext('user-2');
    await assertFails(stranger.firestore().doc('orders/TSG-260719-00000001').get());
  });

  it('a different signed-in user cannot read someone else\'s order items', async () => {
    const stranger = mainEnv.authenticatedContext('user-2');
    await assertFails(stranger.firestore().doc('orders/TSG-260719-00000001/items/item-1').get());
  });

  it('a different signed-in user cannot read someone else\'s payment record', async () => {
    const stranger = mainEnv.authenticatedContext('user-2');
    await assertFails(stranger.firestore().doc('paymentRecords/TSG-260719-00000001').get());
  });

  it('an anonymous caller cannot read any order, item, timeline entry, or payment record', async () => {
    const anonDb = mainEnv.unauthenticatedContext().firestore();
    await assertFails(anonDb.doc('orders/TSG-260719-00000001').get());
    await assertFails(anonDb.doc('orders/TSG-260719-00000001/items/item-1').get());
    await assertFails(anonDb.doc('orders/TSG-260719-00000001/statusHistory/hist-1').get());
    await assertFails(anonDb.doc('paymentRecords/TSG-260719-00000001').get());
  });

  it('STAFF/ADMIN with orders.manage can read any order, items, timeline, and payment record', async () => {
    const admin = mainEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    const db = admin.firestore();
    await assertSucceeds(db.doc('orders/TSG-260719-00000001').get());
    await assertSucceeds(db.doc('orders/TSG-260719-00000001/items/item-1').get());
    await assertSucceeds(db.doc('orders/TSG-260719-00000001/statusHistory/hist-1').get());
    await assertSucceeds(db.doc('paymentRecords/TSG-260719-00000001').get());
  });

  it('STAFF WITHOUT orders.manage cannot read someone else\'s order', async () => {
    const staff = mainEnv.authenticatedContext('staff-1', { role: 'STAFF', permissions: ['products.manage'] });
    await assertFails(staff.firestore().doc('orders/TSG-260719-00000001').get());
  });

  it('NO ONE can write an order directly — not even the owner, not even an ADMIN — order creation is Function-only', async () => {
    const owner = mainEnv.authenticatedContext('user-1');
    const admin = mainEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    await assertFails(owner.firestore().doc('orders/TSG-260719-00000001').update({ status: 'DELIVERED' }));
    await assertFails(admin.firestore().doc('orders/TSG-260719-00000001').update({ status: 'DELIVERED' }));
  });

  it('NO ONE can write order items, status history, or payment records directly', async () => {
    const admin = mainEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    const db = admin.firestore();
    await assertFails(db.doc('orders/TSG-260719-00000001/items/item-1').update({ quantity: 99 }));
    await assertFails(db.doc('orders/TSG-260719-00000001/statusHistory/hist-2').set({ status: 'CANCELLED' }));
    await assertFails(db.doc('paymentRecords/TSG-260719-00000001').update({ status: 'PAID' }));
  });

  it('a stranger cannot fake ownership of a new order doc — write is Function-only regardless of the userId field', async () => {
    const stranger = mainEnv.authenticatedContext('user-2');
    await assertFails(stranger.firestore().doc('orders/TSG-FAKE-00000002').set({ userId: 'user-2', status: 'CONFIRMED' }));
  });
});

describe('firestore.rules — notifications (Phase 6, real committed rules file)', () => {
  beforeEach(async () => {
    await mainEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await adminCtx.firestore().doc('notifications/user-1/items/notif-1').set({ type: 'ORDER', title: 'Order placed', isRead: false });
    });
  });

  it('the owner can read their own notification', async () => {
    const owner = mainEnv.authenticatedContext('user-1');
    await assertSucceeds(owner.firestore().doc('notifications/user-1/items/notif-1').get());
  });

  it('a different signed-in user cannot read someone else\'s notification', async () => {
    const stranger = mainEnv.authenticatedContext('user-2');
    await assertFails(stranger.firestore().doc('notifications/user-1/items/notif-1').get());
  });

  it('an anonymous caller cannot read any notification', async () => {
    const anon = mainEnv.unauthenticatedContext();
    await assertFails(anon.firestore().doc('notifications/user-1/items/notif-1').get());
  });

  it('the owner can mark their own notification read (isRead is the only mutable field)', async () => {
    const owner = mainEnv.authenticatedContext('user-1');
    await assertSucceeds(owner.firestore().doc('notifications/user-1/items/notif-1').update({ isRead: true }));
  });

  it('the owner cannot change any field other than isRead', async () => {
    const owner = mainEnv.authenticatedContext('user-1');
    await assertFails(owner.firestore().doc('notifications/user-1/items/notif-1').update({ title: 'Tampered' }));
  });

  it('a different signed-in user cannot mark someone else\'s notification read', async () => {
    const stranger = mainEnv.authenticatedContext('user-2');
    await assertFails(stranger.firestore().doc('notifications/user-1/items/notif-1').update({ isRead: true }));
  });

  it('NO ONE can create or delete a notification directly — sendNotification Callable-only', async () => {
    const owner = mainEnv.authenticatedContext('user-1');
    const admin = mainEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    await assertFails(owner.firestore().doc('notifications/user-1/items/notif-2').set({ type: 'PROMO', title: 'Sale', isRead: false }));
    await assertFails(admin.firestore().doc('notifications/user-1/items/notif-1').delete());
  });
});

describe('firestore.rules — platformSettings (Phase 6, real committed rules file)', () => {
  beforeEach(async () => {
    await mainEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await adminCtx.firestore().doc('platformSettings/store.name').set({ value: 'TSG eCart' });
    });
  });

  it('an anonymous caller cannot read a platform setting (no public settings endpoint in the source app)', async () => {
    const anon = mainEnv.unauthenticatedContext();
    await assertFails(anon.firestore().doc('platformSettings/store.name').get());
  });

  it('a signed-in CUSTOMER cannot read a platform setting', async () => {
    const customer = mainEnv.authenticatedContext('customer-1', { role: 'CUSTOMER' });
    await assertFails(customer.firestore().doc('platformSettings/store.name').get());
  });

  it('STAFF WITHOUT settings.manage cannot read a platform setting', async () => {
    const staff = mainEnv.authenticatedContext('staff-1', { role: 'STAFF', permissions: ['products.manage'] });
    await assertFails(staff.firestore().doc('platformSettings/store.name').get());
  });

  it('STAFF WITH settings.manage can read and write a platform setting', async () => {
    const staff = mainEnv.authenticatedContext('staff-2', { role: 'STAFF', permissions: ['settings.manage'] });
    const db = staff.firestore();
    await assertSucceeds(db.doc('platformSettings/store.name').get());
    await assertSucceeds(db.doc('platformSettings/maintenanceMode').set({ value: false }));
  });

  it('an ADMIN can read and write a platform setting (implicitly holds every permission)', async () => {
    const admin = mainEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    await assertSucceeds(admin.firestore().doc('platformSettings/store.name').update({ value: 'TSG eCart Updated' }));
  });
});

describe('firestore.rules — Phase 5 internal-only collections (unlisted, no rule needed)', () => {
  it('orderIdempotency is denied to everyone, including an ADMIN — Function/Admin-SDK-only bookkeeping', async () => {
    const admin = mainEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    const owner = mainEnv.authenticatedContext('user-1');
    await assertFails(admin.firestore().doc('orderIdempotency/idem-key-1').get());
    await assertFails(owner.firestore().doc('orderIdempotency/idem-key-1').set({ orderId: 'TSG-1' }));
  });

  it('webhookEvents is denied to everyone, including an ADMIN — Function/Admin-SDK-only Razorpay webhook dedup', async () => {
    const admin = mainEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    const db = admin.firestore();
    await assertFails(db.doc('webhookEvents/payment.captured:pay_1').get());
    await assertFails(db.doc('webhookEvents/payment.captured:pay_1').set({ processedAt: new Date() }));
  });
});

describe('firestore.rules helper functions (isAdmin/isOwner) against real custom claims', () => {
  beforeEach(async () => {
    await helperEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await adminCtx.firestore().doc('_rulesTestScratch/doc1').set({ userId: 'owner-1' });
    });
  });

  it('grants read to the real ADMIN-claim holder', async () => {
    const admin = helperEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    await assertSucceeds(admin.firestore().doc('_rulesTestScratch/doc1').get());
  });

  it('grants read to the document owner (matched by uid, not by a document field claiming a role)', async () => {
    const owner = helperEnv.authenticatedContext('owner-1');
    await assertSucceeds(owner.firestore().doc('_rulesTestScratch/doc1').get());
  });

  it('denies read to a non-owner, non-admin authenticated user', async () => {
    const stranger = helperEnv.authenticatedContext('stranger-1');
    await assertFails(stranger.firestore().doc('_rulesTestScratch/doc1').get());
  });

  it('denies write to a non-admin, even the document owner', async () => {
    const owner = helperEnv.authenticatedContext('owner-1');
    await assertFails(
      owner.firestore().doc('_rulesTestScratch/doc1').set({ userId: 'owner-1', hacked: true }),
    );
  });

  it('a fake `role` field on the document itself does not substitute for the ADMIN claim', async () => {
    await helperEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await adminCtx
        .firestore()
        .doc('_rulesTestScratch/doc2')
        .set({ userId: 'someone-else', role: 'ADMIN' });
    });
    // stranger-2 has no ADMIN custom claim on their own token — the target
    // document merely *contains* a field named "role" set to "ADMIN".
    const stranger = helperEnv.authenticatedContext('stranger-2');
    await assertFails(stranger.firestore().doc('_rulesTestScratch/doc2').get());
  });

  it('confirms custom claims are the sole authority: identical doc, only the token differs', async () => {
    await helperEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await adminCtx.firestore().doc('_rulesTestScratch/doc3').set({ userId: 'owner-3' });
    });
    const withoutClaim = helperEnv.authenticatedContext('owner-3'); // no role claim at all
    const withRealClaim = helperEnv.authenticatedContext('admin-3', { role: 'ADMIN' });

    // Owner (matched by uid) succeeds via isOwner(), independent of any claim.
    await assertSucceeds(withoutClaim.firestore().doc('_rulesTestScratch/doc3').get());
    // A different uid succeeds only because it carries the real ADMIN claim.
    await assertSucceeds(withRealClaim.firestore().doc('_rulesTestScratch/doc3').get());
  });
});

describe('firestore.rules helper function (isDeliveryPartner) against real custom claims', () => {
  beforeEach(async () => {
    await helperEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await adminCtx.firestore().doc('_rulesTestDeliveryScratch/doc1').set({ note: 'route-42' });
    });
  });

  it('grants read to a caller with the real DELIVERY_PARTNER claim', () => {
    const partner = helperEnv.authenticatedContext('partner-1', { role: 'DELIVERY_PARTNER' });
    return assertSucceeds(partner.firestore().doc('_rulesTestDeliveryScratch/doc1').get());
  });

  it('denies read to a signed-in CUSTOMER (no DELIVERY_PARTNER claim)', () => {
    const customer = helperEnv.authenticatedContext('customer-1', { role: 'CUSTOMER' });
    return assertFails(customer.firestore().doc('_rulesTestDeliveryScratch/doc1').get());
  });

  it('denies read to an authenticated user with no role claim at all', () => {
    const stranger = helperEnv.authenticatedContext('stranger-1');
    return assertFails(stranger.firestore().doc('_rulesTestDeliveryScratch/doc1').get());
  });

  it('denies write even to a genuine DELIVERY_PARTNER (admin-only write in this scratch collection)', () => {
    const partner = helperEnv.authenticatedContext('partner-1', { role: 'DELIVERY_PARTNER' });
    return assertFails(
      partner.firestore().doc('_rulesTestDeliveryScratch/doc1').set({ note: 'hacked' }),
    );
  });
});

describe('sanity: rules test setup itself is exercising real emulator round-trips', () => {
  it('withSecurityRulesDisabled writes are actually persisted and readable back by an admin context', async () => {
    await helperEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await adminCtx.firestore().doc('_rulesTestScratch/roundtrip').set({ userId: 'owner-1', n: 42 });
    });
    const admin = helperEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    const snap = await assertSucceeds(admin.firestore().doc('_rulesTestScratch/roundtrip').get());
    expect(snap.data()).toEqual({ userId: 'owner-1', n: 42 });
  });
});
