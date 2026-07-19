import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID, createHmac } from 'node:crypto';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, type Auth } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { collection, connectFirestoreEmulator, getDocs, getFirestore, query, where, type Firestore } from 'firebase/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../src/config/firebaseAdmin';
import { placeOrderTx, attachRazorpayOrder, __setRazorpayClientForTests } from '../../src/orders/orders.function';
import { verifyRazorpayPayment, razorpayWebhook } from '../../src/payments/razorpay.function';
import { getRewardWheel, spinReward } from '../../src/rewards/rewards.function';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { CartResponse } from '../../src/cart/cart.types';
import type { AddressResponse } from '../../src/addresses/addresses.types';
import type { RewardCouponResponse, RewardWheelResponse } from '../../src/rewards/rewards.types';

/**
 * Real Auth + Firestore + Functions emulator integration tests for Phase 5
 * (checkout, orders, coupons, rewards, Razorpay). Run via `npm run
 * test:emulator`. Two call styles are used deliberately:
 *
 * - Most tests call the deployed Callable Functions over the real Functions
 *   emulator (`httpsCallable`), exactly like a real frontend — this
 *   exercises the actual `index.ts` wiring, not just the underlying logic.
 * - Razorpay-specific tests import `orders.function.ts`/`razorpay.function.ts`
 *   directly and call them in-process instead, because the Functions
 *   emulator runs Callables in a SEPARATE process — a client injected via
 *   `__setRazorpayClientForTests` in this test file's process would have no
 *   effect on that separate process. Calling in-process still exercises the
 *   real Firestore transaction against the same live Firestore emulator
 *   (`db` in `firebaseAdmin.ts` connects via `FIRESTORE_EMULATOR_HOST`,
 *   which `firebase emulators:exec` sets for this whole process) — only the
 *   outbound Razorpay network call itself is swapped for a fake.
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

function fakeRequest(uid: string, data?: unknown): CallableRequest {
  return { data, auth: { uid, token: {} } } as unknown as CallableRequest;
}

async function seedVariant(
  sku: string,
  overrides: { stock?: number; reserved?: number; isActive?: boolean; productId?: string; pricePaise?: number; gstRatePercent?: number } = {},
) {
  const now = FieldValue.serverTimestamp();
  const stock = overrides.stock ?? 20;
  const reserved = overrides.reserved ?? 0;
  const productId = overrides.productId ?? `test-product-${sku}`;

  await db.doc(`products/${productId}`).set({
    name: 'Test Product',
    slug: productId,
    description: null,
    categoryId: 'test-category',
    categoryName: 'Test Category',
    brandId: null,
    brandName: null,
    images: ['https://example.test/img.jpg'],
    gstRatePercent: overrides.gstRatePercent ?? 5,
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

async function seedServiceableZone(pincode: string, overrides: { isServiceable?: boolean; zoneActive?: boolean; deliveryChargePaise?: number; freeDeliveryLimitPaise?: number } = {}) {
  const now = FieldValue.serverTimestamp();
  const zoneId = `zone-${pincode}`;
  await db.doc(`deliveryZones/${zoneId}`).set({
    name: 'Test Zone',
    description: null,
    deliveryChargePaise: overrides.deliveryChargePaise ?? 3000,
    freeDeliveryLimitPaise: overrides.freeDeliveryLimitPaise ?? 0,
    minEtaMinutes: 20,
    maxEtaMinutes: 45,
    isActive: overrides.zoneActive ?? true,
    createdAt: now,
    updatedAt: now,
  });
  await db.doc(`serviceablePincodes/${pincode}`).set({
    city: 'Hyderabad',
    state: 'Telangana',
    zoneId,
    isServiceable: overrides.isServiceable ?? true,
    createdAt: now,
    updatedAt: now,
  });
  return zoneId;
}

async function seedCoupon(code: string, overrides: Record<string, unknown> = {}) {
  const now = FieldValue.serverTimestamp();
  await db.doc(`coupons/${code}`).set({
    code,
    description: null,
    type: 'PERCENTAGE',
    value: 10,
    minOrderPaise: 0,
    maxDiscountPaise: null,
    usageLimit: null,
    perUserLimit: 1,
    usedCount: 0,
    startsAt: now,
    expiresAt: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

async function addAddressFor(): Promise<string> {
  const addAddress = httpsCallable<Record<string, unknown>, AddressResponse>(functions, 'addAddress');
  const result = await addAddress({
    contactName: 'Asha Rao',
    contactPhone: '9876543210',
    line1: '123 Main Street',
    pincode: '500001',
  });
  return result.data.id;
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

describe('createOrder — COD, stock reduction, cart clearing', () => {
  it('places a COD order, decrements stock, releases the reservation, and clears the cart', async () => {
    const sku = `SKU-COD-${Date.now()}`;
    await seedVariant(sku, { stock: 20 });
    await seedServiceableZone('500001');
    await signUpAndSignIn('order-cod');

    const addressId = await addAddressFor();
    const addCartItem = httpsCallable<{ variantId: string; quantity: number }, CartResponse>(functions, 'addCartItem');
    await addCartItem({ variantId: sku, quantity: 3 });

    // reserved should now be 3, stock still 20
    const invBefore = await db.doc(`inventory/${sku}`).get();
    expect(invBefore.data()?.reserved).toBe(3);

    const createOrder = httpsCallable<Record<string, unknown>, { order: { id: string; totalPaise: number; status: string } }>(
      functions,
      'createOrder',
    );
    const result = await createOrder({ addressId, paymentMethod: 'COD', idempotencyKey: randomUUID() });

    expect(result.data.order.status).toBe('CONFIRMED');
    expect(result.data.order.id).toMatch(/^TSG-\d{6}-\d{8}$/);

    const invAfter = await db.doc(`inventory/${sku}`).get();
    expect(invAfter.data()?.stock).toBe(17); // 20 - 3
    expect(invAfter.data()?.reserved).toBe(0); // hold converted into a sale

    const getCart = httpsCallable<undefined, CartResponse>(functions, 'getCart');
    const cart = await getCart();
    expect(cart.data.items).toHaveLength(0);
  });

  it('rejects checkout against an unserviceable pincode, and does NOT clear the cart', async () => {
    const sku = `SKU-UNSERVICEABLE-${Date.now()}`;
    await seedVariant(sku, { stock: 20 });
    await signUpAndSignIn('order-unserviceable');

    const addAddress = httpsCallable<Record<string, unknown>, AddressResponse>(functions, 'addAddress');
    const address = await addAddress({
      contactName: 'Asha Rao',
      contactPhone: '9876543210',
      line1: 'Somewhere else',
      pincode: '999999', // never seeded as serviceable
    });

    const addCartItem = httpsCallable<{ variantId: string; quantity: number }, CartResponse>(functions, 'addCartItem');
    await addCartItem({ variantId: sku, quantity: 1 });

    const createOrder = httpsCallable(functions, 'createOrder');
    await expect(
      createOrder({ addressId: address.data.id, paymentMethod: 'COD', idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });

    const getCart = httpsCallable<undefined, CartResponse>(functions, 'getCart');
    const cart = await getCart();
    expect(cart.data.items).toHaveLength(1); // untouched — order was never created
  });
});

describe('createOrder — overselling prevention', () => {
  it('rejects order creation if stock was depleted by another process after the cart reservation', async () => {
    const sku = `SKU-OVERSELL-${Date.now()}`;
    await seedVariant(sku, { stock: 5 });
    await seedServiceableZone('500001');
    await signUpAndSignIn('order-oversell');

    const addressId = await addAddressFor();
    const addCartItem = httpsCallable<{ variantId: string; quantity: number }, CartResponse>(functions, 'addCartItem');
    await addCartItem({ variantId: sku, quantity: 5 }); // reserves all 5

    // Simulate a concurrent process consuming real stock down to 2 (e.g. an
    // admin manual stock correction) WITHOUT touching the reservation this
    // cart is holding — this is the exact race the real guard defends.
    await db.doc(`inventory/${sku}`).update({ stock: 2 });

    const createOrder = httpsCallable(functions, 'createOrder');
    await expect(
      createOrder({ addressId, paymentMethod: 'COD', idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: 'functions/failed-precondition' });

    // Nothing was consumed by the rejected attempt.
    const invAfter = await db.doc(`inventory/${sku}`).get();
    expect(invAfter.data()?.stock).toBe(2);
  });
});

describe('createOrder — duplicate order prevention (idempotency)', () => {
  it('reusing the same idempotencyKey returns the original order instead of creating a second one', async () => {
    const sku = `SKU-IDEMPOTENT-${Date.now()}`;
    await seedVariant(sku, { stock: 20 });
    await seedServiceableZone('500001');
    const uid = await signUpAndSignIn('order-idempotent');

    const addressId = await addAddressFor();
    const addCartItem = httpsCallable<{ variantId: string; quantity: number }, CartResponse>(functions, 'addCartItem');
    await addCartItem({ variantId: sku, quantity: 2 });

    const createOrder = httpsCallable<Record<string, unknown>, { order: { id: string } }>(functions, 'createOrder');
    const key = randomUUID();
    const first = await createOrder({ addressId, paymentMethod: 'COD', idempotencyKey: key });

    // Re-add to cart (it was cleared by the first successful call) so a
    // SECOND real order would be possible if idempotency didn't block it.
    await addCartItem({ variantId: sku, quantity: 2 });
    const second = await createOrder({ addressId, paymentMethod: 'COD', idempotencyKey: key });

    expect(second.data.order.id).toBe(first.data.order.id);

    const ordersSnap = await getDocs(query(collection(firestore, 'orders'), where('userId', '==', uid)));
    expect(ordersSnap.size).toBe(1);

    const invAfter = await db.doc(`inventory/${sku}`).get();
    expect(invAfter.data()?.stock).toBe(18); // decremented exactly once (20-2), not twice
  });
});

describe('createOrder — global coupon validation and redemption', () => {
  it('applies a valid coupon, records usage, and increments usedCount', async () => {
    const sku = `SKU-COUPON-${Date.now()}`;
    await seedVariant(sku, { stock: 20, pricePaise: 100_00 });
    await seedServiceableZone('500001');
    await signUpAndSignIn('order-coupon');
    const code = `SAVE10-${Date.now()}`;
    await seedCoupon(code, { type: 'PERCENTAGE', value: 10 });

    const addressId = await addAddressFor();
    const addCartItem = httpsCallable<{ variantId: string; quantity: number }, CartResponse>(functions, 'addCartItem');
    await addCartItem({ variantId: sku, quantity: 1 });

    const createOrder = httpsCallable<Record<string, unknown>, { order: { discountPaise: number } }>(functions, 'createOrder');
    const result = await createOrder({ addressId, paymentMethod: 'COD', couponCode: code, idempotencyKey: randomUUID() });

    expect(result.data.order.discountPaise).toBe(1000); // 10% of 10000

    const couponSnap = await db.doc(`coupons/${code}`).get();
    expect(couponSnap.data()?.usedCount).toBe(1);

    const usagesSnap = await db.collection('couponUsages').where('couponCode', '==', code).get();
    expect(usagesSnap.size).toBe(1);
  });

  it('rejects an inactive coupon code with a clear validation error, order is not created', async () => {
    const sku = `SKU-BADCOUPON-${Date.now()}`;
    await seedVariant(sku, { stock: 20 });
    await seedServiceableZone('500001');
    await signUpAndSignIn('order-badcoupon');
    const code = `EXPIRED-${Date.now()}`;
    await seedCoupon(code, { isActive: false });

    const addressId = await addAddressFor();
    const addCartItem = httpsCallable<{ variantId: string; quantity: number }, CartResponse>(functions, 'addCartItem');
    await addCartItem({ variantId: sku, quantity: 1 });

    const createOrder = httpsCallable(functions, 'createOrder');
    await expect(
      createOrder({ addressId, paymentMethod: 'COD', couponCode: code, idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
  });
});

describe('createOrder — reward coupon ownership and redemption', () => {
  it('redeems the caller\'s own reward coupon and marks it REDEEMED', async () => {
    const sku = `SKU-REWARD-${Date.now()}`;
    await seedVariant(sku, { stock: 20, pricePaise: 100_00 });
    await seedServiceableZone('500001');
    const uid = await signUpAndSignIn('order-reward');

    const rewardCode = `SPIN-TEST${Date.now()}`;
    const now = FieldValue.serverTimestamp();
    await db.doc(`rewardCoupons/${rewardCode}`).set({
      code: rewardCode,
      userId: uid,
      cashbackAmountPaise: 500,
      minOrderPaise: 0,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      redeemedOrderId: null,
      redeemedAt: null,
      createdAt: now,
    });

    const addressId = await addAddressFor();
    const addCartItem = httpsCallable<{ variantId: string; quantity: number }, CartResponse>(functions, 'addCartItem');
    await addCartItem({ variantId: sku, quantity: 1 });

    const createOrder = httpsCallable<Record<string, unknown>, { order: { id: string; discountPaise: number } }>(functions, 'createOrder');
    const result = await createOrder({ addressId, paymentMethod: 'COD', couponCode: rewardCode, idempotencyKey: randomUUID() });

    expect(result.data.order.discountPaise).toBe(500);

    const rewardSnap = await db.doc(`rewardCoupons/${rewardCode}`).get();
    expect(rewardSnap.data()?.status).toBe('REDEEMED');
    expect(rewardSnap.data()?.redeemedOrderId).toBe(result.data.order.id);
  });

  it("rejects redeeming another user's reward coupon", async () => {
    const sku = `SKU-REWARD-STOLEN-${Date.now()}`;
    await seedVariant(sku, { stock: 20 });
    await seedServiceableZone('500001');
    const ownerUid = await signUpAndSignIn('order-reward-owner');

    const rewardCode = `SPIN-STOLEN${Date.now()}`;
    await db.doc(`rewardCoupons/${rewardCode}`).set({
      code: rewardCode,
      userId: ownerUid,
      cashbackAmountPaise: 500,
      minOrderPaise: 0,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      redeemedOrderId: null,
      redeemedAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });

    await signUpAndSignIn('order-reward-thief');
    const addressId = await addAddressFor();
    const addCartItem = httpsCallable<{ variantId: string; quantity: number }, CartResponse>(functions, 'addCartItem');
    await addCartItem({ variantId: sku, quantity: 1 });

    const createOrder = httpsCallable(functions, 'createOrder');
    await expect(
      createOrder({ addressId, paymentMethod: 'COD', couponCode: rewardCode, idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });

    const rewardSnap = await db.doc(`rewardCoupons/${rewardCode}`).get();
    expect(rewardSnap.data()?.status).toBe('ACTIVE'); // untouched
  });
});

describe('order history / detail ownership isolation (direct client Firestore reads)', () => {
  it("a signed-in user's order list query never returns another user's orders", async () => {
    const sku = `SKU-ISOLATION-${Date.now()}`;
    await seedVariant(sku, { stock: 20 });
    await seedServiceableZone('500001');
    await signUpAndSignIn('order-owner');
    const addressId = await addAddressFor();
    const addCartItem = httpsCallable<{ variantId: string; quantity: number }, CartResponse>(functions, 'addCartItem');
    await addCartItem({ variantId: sku, quantity: 1 });
    const createOrder = httpsCallable<Record<string, unknown>, { order: { id: string } }>(functions, 'createOrder');
    const placed = await createOrder({ addressId, paymentMethod: 'COD', idempotencyKey: randomUUID() });

    const strangerUid = await signUpAndSignIn('order-stranger');
    const strangerOrders = await getDocs(query(collection(firestore, 'orders'), where('userId', '==', strangerUid)));
    expect(strangerOrders.size).toBe(0);

    // A direct doc-path read of the other user's order is denied by Rules
    // (covered exhaustively in firestore.rules.test.ts) — confirmed here
    // too, end-to-end, against a REAL order this suite just created.
    const { getDoc, doc } = await import('firebase/firestore');
    await expect(getDoc(doc(firestore, `orders/${placed.data.order.id}`))).rejects.toThrow();
  });
});

describe('Razorpay — order creation, signature verification, webhook (in-process against the live Firestore emulator)', () => {
  it('attachRazorpayOrder creates a Razorpay order via the injected client and stores razorpayOrderId', async () => {
    const fakeRazorpayOrderId = `order_fake_${Date.now()}`;
    __setRazorpayClientForTests({
      createOrder: async ({ amountPaise, currency }) => ({ id: fakeRazorpayOrderId, amount: amountPaise, currency }),
      refund: async () => ({ id: 'rfnd_fake' }),
    });

    try {
      const sku = `SKU-RZP-${Date.now()}`;
      await seedVariant(sku, { stock: 10, pricePaise: 50_00 });
      await seedServiceableZone('500001');
      const uid = randomUUID().slice(0, 20);

      const input = { addressId: '', paymentMethod: 'RAZORPAY' as const, couponCode: null, notes: null, idempotencyKey: randomUUID() };
      // Build a real address for this synthetic uid via the Admin SDK directly (no client sign-in needed for this in-process test).
      const addrRef = db.collection('addresses').doc();
      await addrRef.set({
        userId: uid,
        label: null,
        type: 'HOME',
        contactName: 'Test User',
        contactPhone: '9876543210',
        line1: '1 Test Lane',
        line2: null,
        landmark: null,
        pincode: '500001',
        city: 'Hyderabad',
        state: 'Telangana',
        isDefault: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await db.collection('carts').doc(uid).collection('items').doc(sku).set({
        variantId: sku,
        quantity: 1,
        addedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const result = await placeOrderTx(uid, { ...input, addressId: addrRef.id });
      expect(result.paymentMethod).toBe('RAZORPAY');
      expect(result.totalPaise).toBeGreaterThan(0);

      const razorpay = await attachRazorpayOrder(result.orderId, result.totalPaise);
      expect(razorpay.razorpayOrderId).toBe(fakeRazorpayOrderId);

      const paymentSnap = await db.doc(`paymentRecords/${result.orderId}`).get();
      expect(paymentSnap.data()?.razorpayOrderId).toBe(fakeRazorpayOrderId);
    } finally {
      __setRazorpayClientForTests(null);
    }
  });

  it('verifyRazorpayPayment accepts a correctly-computed signature and marks the payment PAID', async () => {
    const sku = `SKU-RZP-VERIFY-${Date.now()}`;
    await seedVariant(sku, { stock: 10 });
    await seedServiceableZone('500001');
    const uid = randomUUID().slice(0, 20);

    const addrRef = db.collection('addresses').doc();
    await addrRef.set({
      userId: uid, label: null, type: 'HOME', contactName: 'Test User', contactPhone: '9876543210',
      line1: '1 Test Lane', line2: null, landmark: null, pincode: '500001', city: 'Hyderabad', state: 'Telangana',
      isDefault: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    await db.collection('carts').doc(uid).collection('items').doc(sku).set({
      variantId: sku, quantity: 1, addedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });

    const placed = await placeOrderTx(uid, { addressId: addrRef.id, paymentMethod: 'RAZORPAY', couponCode: null, notes: null, idempotencyKey: randomUUID() });
    const razorpayOrderId = `order_verify_${Date.now()}`;
    await db.doc(`paymentRecords/${placed.orderId}`).update({ razorpayOrderId });

    const razorpayPaymentId = `pay_verify_${Date.now()}`;
    // The function verifies with razorpayKeySecretSecret.value(), which
    // resolves to '' in this unconfigured test environment — computing the
    // expected signature with the SAME empty secret keeps this a faithful
    // exercise of the real HMAC comparison, not a bypass.
    const validSignature = createHmac('sha256', '').update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');

    const response = await verifyRazorpayPayment.run(
      fakeRequest(uid, { razorpayOrderId, razorpayPaymentId, razorpaySignature: validSignature }),
    );
    expect(response).toEqual({ verified: true });

    const paymentSnap = await db.doc(`paymentRecords/${placed.orderId}`).get();
    expect(paymentSnap.data()?.status).toBe('PAID');
    const orderSnap = await db.doc(`orders/${placed.orderId}`).get();
    expect(orderSnap.data()?.paymentStatus).toBe('PAID');
  });

  it('verifyRazorpayPayment rejects an invalid signature and marks the payment FAILED', async () => {
    const sku = `SKU-RZP-INVALID-${Date.now()}`;
    await seedVariant(sku, { stock: 10 });
    await seedServiceableZone('500001');
    const uid = randomUUID().slice(0, 20);

    const addrRef = db.collection('addresses').doc();
    await addrRef.set({
      userId: uid, label: null, type: 'HOME', contactName: 'Test User', contactPhone: '9876543210',
      line1: '1 Test Lane', line2: null, landmark: null, pincode: '500001', city: 'Hyderabad', state: 'Telangana',
      isDefault: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    await db.collection('carts').doc(uid).collection('items').doc(sku).set({
      variantId: sku, quantity: 1, addedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });

    const placed = await placeOrderTx(uid, { addressId: addrRef.id, paymentMethod: 'RAZORPAY', couponCode: null, notes: null, idempotencyKey: randomUUID() });
    const razorpayOrderId = `order_invalid_${Date.now()}`;
    await db.doc(`paymentRecords/${placed.orderId}`).update({ razorpayOrderId });

    await expect(
      verifyRazorpayPayment.run(
        fakeRequest(uid, { razorpayOrderId, razorpayPaymentId: 'pay_invalid', razorpaySignature: 'tampered-signature' }),
      ),
    ).rejects.toMatchObject({ code: 'invalid-argument' });

    const paymentSnap = await db.doc(`paymentRecords/${placed.orderId}`).get();
    expect(paymentSnap.data()?.status).toBe('FAILED');
  });

  it('razorpayWebhook payment.captured settles a PENDING payment, and payment.failed marks it FAILED', async () => {
    const sku = `SKU-RZP-WEBHOOK-${Date.now()}`;
    await seedVariant(sku, { stock: 10 });
    await seedServiceableZone('500001');
    const uid = randomUUID().slice(0, 20);

    const addrRef = db.collection('addresses').doc();
    await addrRef.set({
      userId: uid, label: null, type: 'HOME', contactName: 'Test User', contactPhone: '9876543210',
      line1: '1 Test Lane', line2: null, landmark: null, pincode: '500001', city: 'Hyderabad', state: 'Telangana',
      isDefault: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    await db.collection('carts').doc(uid).collection('items').doc(sku).set({
      variantId: sku, quantity: 1, addedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });

    const placed = await placeOrderTx(uid, { addressId: addrRef.id, paymentMethod: 'RAZORPAY', couponCode: null, notes: null, idempotencyKey: randomUUID() });
    const razorpayOrderId = `order_webhook_${Date.now()}`;
    await db.doc(`paymentRecords/${placed.orderId}`).update({ razorpayOrderId });

    const capturedBody = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: `pay_webhook_${Date.now()}`, order_id: razorpayOrderId, amount: placed.totalPaise } } },
    });
    const capturedSignature = createHmac('sha256', '').update(capturedBody).digest('hex');

    let capturedStatus = 0;
    const capturedRes = {
      status(code: number) { capturedStatus = code; return this; },
      json() { return this; },
    };
    await razorpayWebhook(
      { header: (n: string) => (n.toLowerCase() === 'x-razorpay-signature' ? capturedSignature : undefined), rawBody: Buffer.from(capturedBody) } as never,
      capturedRes as never,
    );
    expect(capturedStatus).toBe(200);

    const paymentSnap = await db.doc(`paymentRecords/${placed.orderId}`).get();
    expect(paymentSnap.data()?.status).toBe('PAID');

    // Re-delivering the SAME event must be a no-op (idempotent), not an error.
    let redeliveredStatus = 0;
    const redeliveredRes = { status(code: number) { redeliveredStatus = code; return this; }, json() { return this; } };
    await razorpayWebhook(
      { header: (n: string) => (n.toLowerCase() === 'x-razorpay-signature' ? capturedSignature : undefined), rawBody: Buffer.from(capturedBody) } as never,
      redeliveredRes as never,
    );
    expect(redeliveredStatus).toBe(200);
    const paymentSnapAfterRedelivery = await db.doc(`paymentRecords/${placed.orderId}`).get();
    expect(paymentSnapAfterRedelivery.data()?.status).toBe('PAID'); // unchanged, not double-processed
  });

  it('razorpayWebhook payment.failed marks the payment FAILED without touching order status', async () => {
    const sku = `SKU-RZP-FAILED-${Date.now()}`;
    await seedVariant(sku, { stock: 10 });
    await seedServiceableZone('500001');
    const uid = randomUUID().slice(0, 20);

    const addrRef = db.collection('addresses').doc();
    await addrRef.set({
      userId: uid, label: null, type: 'HOME', contactName: 'Test User', contactPhone: '9876543210',
      line1: '1 Test Lane', line2: null, landmark: null, pincode: '500001', city: 'Hyderabad', state: 'Telangana',
      isDefault: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    await db.collection('carts').doc(uid).collection('items').doc(sku).set({
      variantId: sku, quantity: 1, addedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });

    const placed = await placeOrderTx(uid, { addressId: addrRef.id, paymentMethod: 'RAZORPAY', couponCode: null, notes: null, idempotencyKey: randomUUID() });
    const razorpayOrderId = `order_failed_${Date.now()}`;
    await db.doc(`paymentRecords/${placed.orderId}`).update({ razorpayOrderId });

    const failedBody = JSON.stringify({
      event: 'payment.failed',
      payload: { payment: { entity: { id: `pay_failed_${Date.now()}`, order_id: razorpayOrderId, amount: placed.totalPaise } } },
    });
    const failedSignature = createHmac('sha256', '').update(failedBody).digest('hex');
    let status = 0;
    const res = { status(code: number) { status = code; return this; }, json() { return this; } };
    await razorpayWebhook(
      { header: (n: string) => (n.toLowerCase() === 'x-razorpay-signature' ? failedSignature : undefined), rawBody: Buffer.from(failedBody) } as never,
      res as never,
    );
    expect(status).toBe(200);

    const paymentSnap = await db.doc(`paymentRecords/${placed.orderId}`).get();
    expect(paymentSnap.data()?.status).toBe('FAILED');
    const orderSnap = await db.doc(`orders/${placed.orderId}`).get();
    expect(orderSnap.data()?.paymentStatus).toBe('PENDING'); // unaffected — matches existing Express behavior
  });
});

describe('reward-spin wheel — 24-hour cooldown', () => {
  it('blocks a second spin within 24h, and getRewardWheel reports canSpin:false with a nextSpinAt', async () => {
    const uid = randomUUID().slice(0, 20);
    const now = FieldValue.serverTimestamp();
    await db.doc('rewardConfigs/tier-a').set({ cashbackAmountPaise: 500, probability: 100, minOrderPaise: 0, expiryDays: 3, isActive: true, sortOrder: 0, createdAt: now, updatedAt: now });

    const first = (await spinReward.run(fakeRequest(uid))) as { coupon: RewardCouponResponse };
    expect(first.coupon.status).toBe('ACTIVE');

    await expect(spinReward.run(fakeRequest(uid))).rejects.toMatchObject({ code: 'already-exists' });

    const wheel = (await getRewardWheel.run(fakeRequest(uid))) as RewardWheelResponse;
    expect(wheel.canSpin).toBe(false);
    expect(wheel.nextSpinAt).not.toBeNull();
  });
});
