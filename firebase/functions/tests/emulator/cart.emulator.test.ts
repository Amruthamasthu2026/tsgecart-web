import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, type Auth } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import {
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../src/config/firebaseAdmin';
import type { CartResponse } from '../../src/cart/cart.types';
import type { AddressResponse } from '../../src/addresses/addresses.types';

/**
 * Real Auth + Firestore + Functions emulator integration tests for Phase 4
 * (product variants, inventory reservation, cart, wishlist, addresses).
 * Run via `npm run test:emulator`.
 */

const PROJECT_ID = 'demo-tsgecart';
const AUTH_EMULATOR_HOST = '127.0.0.1';
const AUTH_EMULATOR_PORT = 9099;
const FUNCTIONS_EMULATOR_HOST = '127.0.0.1';
const FUNCTIONS_EMULATOR_PORT = 5001;
const FIRESTORE_EMULATOR_HOST = '127.0.0.1';
const FIRESTORE_EMULATOR_PORT = 8080;

let app: FirebaseApp;
let auth: Auth;
let functions: Functions;
let firestore: Firestore;

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

async function signUpAndSignIn(label: string): Promise<string> {
  const email = uniqueEmail(label);
  const cred = await createUserWithEmailAndPassword(auth, email, 'Password123!');
  return cred.user.uid;
}

async function seedVariant(
  sku: string,
  overrides: { stock?: number; reserved?: number; isActive?: boolean; productId?: string; pricePaise?: number } = {},
) {
  const now = FieldValue.serverTimestamp();
  const stock = overrides.stock ?? 20;
  const reserved = overrides.reserved ?? 0;
  const productId = overrides.productId ?? 'test-product';

  await db.doc(`products/${productId}`).set({
    name: 'Test Product',
    slug: productId,
    description: null,
    categoryId: 'test-category',
    categoryName: 'Test Category',
    brandId: null,
    brandName: null,
    images: ['https://example.test/img.jpg'],
    gstRatePercent: 5,
    hsnCode: null,
    isActive: true,
    isFeatured: false,
    isBestSeller: false,
    ratingAvg: 0,
    ratingCount: 0,
    metaTitle: null,
    metaDescription: null,
    minPricePaise: overrides.pricePaise ?? 10000,
    maxPricePaise: overrides.pricePaise ?? 10000,
    defaultVariant: null,
    createdAt: now,
    updatedAt: now,
  });

  await db.doc(`productVariants/${sku}`).set({
    productId,
    unitLabel: '500 g',
    mrpPaise: 12000,
    pricePaise: overrides.pricePaise ?? 10000,
    weightGrams: 500,
    isActive: overrides.isActive ?? true,
    isDefault: true,
    availableStock: Math.max(0, stock - reserved),
    createdAt: now,
    updatedAt: now,
  });

  await db.doc(`inventory/${sku}`).set({
    stock,
    reserved,
    lowStockThreshold: 5,
    isLowStock: stock - reserved <= 5,
    updatedAt: now,
  });
}

beforeAll(() => {
  app = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-api-key-for-emulator' });
  auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_EMULATOR_HOST}:${AUTH_EMULATOR_PORT}`, { disableWarnings: true });
  functions = getFunctions(app);
  connectFunctionsEmulator(functions, FUNCTIONS_EMULATOR_HOST, FUNCTIONS_EMULATOR_PORT);
  firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
});

afterAll(async () => {
  await deleteApp(app);
});

describe('cart — in-stock add to cart reserves inventory transactionally', () => {
  it('adding an item increases reserved stock and the cart shows the correct line/total', async () => {
    const sku = `SKU-INSTOCK-${Date.now()}`;
    await seedVariant(sku, { stock: 20, reserved: 0, pricePaise: 10500 });
    await signUpAndSignIn('cart-instock');

    const addCartItem = httpsCallable<{ variantId: string; quantity: number }, CartResponse>(functions, 'addCartItem');
    const result = await addCartItem({ variantId: sku, quantity: 2 });

    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0]).toMatchObject({ variantId: sku, quantity: 2, lineTotalPaise: 21000 });
    expect(result.data.itemCount).toBe(2);
    expect(result.data.subtotalPaise).toBe(21000);

    const inventorySnap = await db.doc(`inventory/${sku}`).get();
    expect(inventorySnap.data()?.reserved).toBe(2);

    const variantSnap = await db.doc(`productVariants/${sku}`).get();
    expect(variantSnap.data()?.availableStock).toBe(18);
  });
});

describe('cart — out-of-stock denial', () => {
  it('rejects adding more than the currently available stock', async () => {
    const sku = `SKU-LOWSTOCK-${Date.now()}`;
    await seedVariant(sku, { stock: 3, reserved: 0 });
    await signUpAndSignIn('cart-oos');

    const addCartItem = httpsCallable(functions, 'addCartItem');
    await expect(addCartItem({ variantId: sku, quantity: 5 })).rejects.toMatchObject({
      code: 'functions/failed-precondition',
    });

    // Confirm nothing was reserved by the rejected attempt.
    const inventorySnap = await db.doc(`inventory/${sku}`).get();
    expect(inventorySnap.data()?.reserved).toBe(0);
  });

  it('rejects adding to an inactive variant', async () => {
    const sku = `SKU-INACTIVE-${Date.now()}`;
    await seedVariant(sku, { isActive: false });
    await signUpAndSignIn('cart-inactive');

    const addCartItem = httpsCallable(functions, 'addCartItem');
    // Not a stock problem (failed-precondition) — an invalid selection, so
    // it maps to invalid-argument (see cart.function.ts's assertSellableVariant).
    await expect(addCartItem({ variantId: sku, quantity: 1 })).rejects.toMatchObject({
      code: 'functions/invalid-argument',
    });
  });

  it('rejects adding a variant that does not exist (deleted product)', async () => {
    await signUpAndSignIn('cart-deleted');
    const addCartItem = httpsCallable(functions, 'addCartItem');
    await expect(addCartItem({ variantId: 'NONEXISTENT-SKU', quantity: 1 })).rejects.toMatchObject({
      code: 'functions/not-found',
    });
  });
});

describe('cart — quantity limit', () => {
  it('rejects adding beyond MAX_QTY_PER_ITEM (20) even with ample stock', async () => {
    const sku = `SKU-MAXQTY-${Date.now()}`;
    await seedVariant(sku, { stock: 100, reserved: 0 });
    await signUpAndSignIn('cart-maxqty');

    const addCartItem = httpsCallable(functions, 'addCartItem');
    await expect(addCartItem({ variantId: sku, quantity: 21 })).rejects.toMatchObject({
      code: 'functions/invalid-argument',
    });
  });
});

describe('cart — update quantity releases/reserves the delta, and quantity:0 removes + releases fully', () => {
  it('increasing quantity reserves the additional delta only', async () => {
    const sku = `SKU-UPDATE-${Date.now()}`;
    await seedVariant(sku, { stock: 20, reserved: 0 });
    await signUpAndSignIn('cart-update');

    const addCartItem = httpsCallable<{ variantId: string; quantity: number }, CartResponse>(functions, 'addCartItem');
    const updateCartItemQuantity = httpsCallable<{ variantId: string; quantity: number }, CartResponse>(
      functions,
      'updateCartItemQuantity',
    );

    await addCartItem({ variantId: sku, quantity: 2 });
    await updateCartItemQuantity({ variantId: sku, quantity: 5 });

    const inventorySnap = await db.doc(`inventory/${sku}`).get();
    expect(inventorySnap.data()?.reserved).toBe(5);
  });

  it('setting quantity to 0 removes the line and releases the full reservation', async () => {
    const sku = `SKU-REMOVE-${Date.now()}`;
    await seedVariant(sku, { stock: 20, reserved: 0 });
    await signUpAndSignIn('cart-remove');

    const addCartItem = httpsCallable<{ variantId: string; quantity: number }, CartResponse>(functions, 'addCartItem');
    const updateCartItemQuantity = httpsCallable<{ variantId: string; quantity: number }, CartResponse>(
      functions,
      'updateCartItemQuantity',
    );

    await addCartItem({ variantId: sku, quantity: 4 });
    const result = await updateCartItemQuantity({ variantId: sku, quantity: 0 });

    expect(result.data.items).toHaveLength(0);
    const inventorySnap = await db.doc(`inventory/${sku}`).get();
    expect(inventorySnap.data()?.reserved).toBe(0);
  });
});

describe('cart — clearCart releases all reservations', () => {
  it('removes every item and releases their reservations', async () => {
    const skuA = `SKU-CLEAR-A-${Date.now()}`;
    const skuB = `SKU-CLEAR-B-${Date.now()}`;
    await seedVariant(skuA, { stock: 10, reserved: 0 });
    await seedVariant(skuB, { stock: 10, reserved: 0 });
    await signUpAndSignIn('cart-clear');

    const addCartItem = httpsCallable<{ variantId: string; quantity: number }, CartResponse>(functions, 'addCartItem');
    const clearCart = httpsCallable<undefined, CartResponse>(functions, 'clearCart');

    await addCartItem({ variantId: skuA, quantity: 3 });
    await addCartItem({ variantId: skuB, quantity: 2 });
    const result = await clearCart();

    expect(result.data.items).toHaveLength(0);
    const [invA, invB] = await Promise.all([db.doc(`inventory/${skuA}`).get(), db.doc(`inventory/${skuB}`).get()]);
    expect(invA.data()?.reserved).toBe(0);
    expect(invB.data()?.reserved).toBe(0);
  });
});

describe('cart — ownership isolation', () => {
  it("getCart never returns another user's items — each signed-in user sees only their own cart", async () => {
    const sku = `SKU-ISOLATION-${Date.now()}`;
    await seedVariant(sku, { stock: 20, reserved: 0 });

    await signUpAndSignIn('cart-user-a');
    const addCartItem = httpsCallable<{ variantId: string; quantity: number }, CartResponse>(functions, 'addCartItem');
    await addCartItem({ variantId: sku, quantity: 1 });

    await signUpAndSignIn('cart-user-b');
    const getCart = httpsCallable<undefined, CartResponse>(functions, 'getCart');
    const result = await getCart();

    expect(result.data.items).toHaveLength(0);
  });
});

describe('addresses — CRUD, default-address behavior, ownership isolation', () => {
  it('the first address created is automatically the default', async () => {
    await signUpAndSignIn('addr-first');
    const addAddress = httpsCallable<Record<string, unknown>, AddressResponse>(functions, 'addAddress');
    const result = await addAddress({
      contactName: 'Asha Rao',
      contactPhone: '9876543210',
      line1: '123 Main Street',
      pincode: '500001',
    });
    expect(result.data.isDefault).toBe(true);
  });

  it('a second, non-default address does not change the existing default', async () => {
    await signUpAndSignIn('addr-second');
    const addAddress = httpsCallable<Record<string, unknown>, AddressResponse>(functions, 'addAddress');
    const first = await addAddress({
      contactName: 'Asha Rao',
      contactPhone: '9876543210',
      line1: 'Home address',
      pincode: '500001',
    });
    const second = await addAddress({
      contactName: 'Asha Rao',
      contactPhone: '9876543210',
      line1: 'Work address',
      pincode: '500002',
      isDefault: false,
    });
    expect(first.data.isDefault).toBe(true);
    expect(second.data.isDefault).toBe(false);
  });

  it('setting a new address as default unsets the previous default (only one default at a time)', async () => {
    await signUpAndSignIn('addr-switch');
    const addAddress = httpsCallable<Record<string, unknown>, AddressResponse>(functions, 'addAddress');
    const first = await addAddress({
      contactName: 'Asha Rao',
      contactPhone: '9876543210',
      line1: 'Home address',
      pincode: '500001',
    });
    await addAddress({
      contactName: 'Asha Rao',
      contactPhone: '9876543210',
      line1: 'Work address',
      pincode: '500002',
      isDefault: true,
    });

    const firstSnap = await db.doc(`addresses/${first.data.id}`).get();
    expect(firstSnap.data()?.isDefault).toBe(false);
  });

  it('deleting the default address promotes another address to default', async () => {
    await signUpAndSignIn('addr-delete');
    const addAddress = httpsCallable<Record<string, unknown>, AddressResponse>(functions, 'addAddress');
    const deleteAddress = httpsCallable<{ id: string }, { deleted: true }>(functions, 'deleteAddress');

    const first = await addAddress({
      contactName: 'Asha Rao',
      contactPhone: '9876543210',
      line1: 'Home address',
      pincode: '500001',
    });
    const second = await addAddress({
      contactName: 'Asha Rao',
      contactPhone: '9876543210',
      line1: 'Work address',
      pincode: '500002',
    });

    await deleteAddress({ id: first.data.id });

    const secondSnap = await db.doc(`addresses/${second.data.id}`).get();
    expect(secondSnap.data()?.isDefault).toBe(true);
  });

  it('a user cannot update or delete another user\'s address (ownership isolation)', async () => {
    await signUpAndSignIn('addr-owner');
    const addAddress = httpsCallable<Record<string, unknown>, AddressResponse>(functions, 'addAddress');
    const owned = await addAddress({
      contactName: 'Asha Rao',
      contactPhone: '9876543210',
      line1: 'Home address',
      pincode: '500001',
    });

    await signUpAndSignIn('addr-stranger');
    const updateAddress = httpsCallable(functions, 'updateAddress');
    const deleteAddress = httpsCallable(functions, 'deleteAddress');

    await expect(
      updateAddress({
        id: owned.data.id,
        contactName: 'Hacked',
        contactPhone: '9876543210',
        line1: 'Hacked address',
        pincode: '500001',
      }),
    ).rejects.toMatchObject({ code: 'functions/not-found' });

    await expect(deleteAddress({ id: owned.data.id })).rejects.toMatchObject({ code: 'functions/not-found' });
  });
});

describe('wishlist — direct client Firestore, duplicate prevention, ownership isolation', () => {
  let uidA: string;
  let uidB: string;

  beforeEach(async () => {
    uidA = await signUpAndSignIn('wishlist-a');
  });

  it('the owner can add and read their own wishlist item directly (no Function)', async () => {
    await setDoc(doc(firestore, `wishlists/${uidA}/items/test-product`), { addedAt: new Date() });
    const snap = await getDoc(doc(firestore, `wishlists/${uidA}/items/test-product`));
    expect(snap.exists()).toBe(true);
  });

  it('adding the same product twice does not create a duplicate (doc ID = productId, set is idempotent)', async () => {
    const ref = doc(firestore, `wishlists/${uidA}/items/dup-product`);
    await setDoc(ref, { addedAt: new Date() });
    await setDoc(ref, { addedAt: new Date() });
    const snap = await getDoc(ref);
    expect(snap.exists()).toBe(true);
    // A single doc at this path is structurally the only possible outcome —
    // there is no way for a "duplicate" to exist under a different ID for
    // the same (uid, productId) pair.
  });

  it('the owner can remove a wishlist item directly', async () => {
    const ref = doc(firestore, `wishlists/${uidA}/items/removable-product`);
    await setDoc(ref, { addedAt: new Date() });
    await deleteDoc(ref);
    const snap = await getDoc(ref);
    expect(snap.exists()).toBe(false);
  });

  it("a different signed-in user cannot read or write user A's wishlist", async () => {
    await setDoc(doc(firestore, `wishlists/${uidA}/items/private-product`), { addedAt: new Date() });
    uidB = await signUpAndSignIn('wishlist-b');

    await expect(getDoc(doc(firestore, `wishlists/${uidA}/items/private-product`))).rejects.toThrow();
    await expect(
      setDoc(doc(firestore, `wishlists/${uidA}/items/hacked-product`), { addedAt: new Date() }),
    ).rejects.toThrow();
    // uidB is asserted-used only for readability/intent in this test name.
    expect(uidB).not.toBe(uidA);
  });
});
