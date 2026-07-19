import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin';
import { razorpayKeyIdSecret, razorpayKeySecretSecret } from '../config/environment';
import { requireAuthenticatedCaller, requirePermission } from '../shared/auth';
import { parseInput } from '../shared/validation';
import { AppError, NotFoundError, BadRequestError, ConflictError } from '../shared/errors';
import { computeLineTotalPaise } from '../cart/cart.queries';
import { consumeStockForOrder, restockInventory, computeAvailable } from '../inventory/inventory';
import { computeDeliveryChargePaise } from '../delivery/delivery';
import { evaluateGlobalCoupon, type CouponEvalShape } from '../coupons/coupons.logic';
import { evaluateRewardCoupon, type RewardCouponEvalShape } from '../rewards/rewards.logic';
import { computeOrderTotals, canTransitionOrderStatus, CUSTOMER_CANCELLABLE_STATUSES, generateOrderNumber } from './orders.logic';
import { createRealRazorpayClient, type RazorpayClient } from '../payments/razorpayClient';
import type { FirestoreCartItemDoc } from '../cart/cart.types';
import type { FirestoreVariantDoc } from '../catalog/variants.types';
import type { FirestoreProductDoc } from '../catalog/catalog.types';
import type { FirestoreInventoryDoc } from '../inventory/inventory.types';
import type { FirestoreAddressDoc } from '../addresses/addresses.types';
import type { FirestoreCouponDoc } from '../coupons/coupons.types';
import type { FirestoreRewardCouponDoc } from '../rewards/rewards.types';
import type { FirestoreDeliveryZoneDoc, FirestoreServiceablePincodeDoc } from '../delivery/delivery.types';
import type {
  FirestoreOrderDoc,
  FirestoreOrderItemDoc,
  FirestoreOrderStatusHistoryDoc,
  FirestorePaymentRecordDoc,
  OrderResponse,
  OrderStatus,
} from './orders.types';

/**
 * Order creation, migration Phase 5 — the single highest-risk piece of
 * business logic in this migration (audit §22), ported as one Firestore
 * transaction that re-reads and re-validates everything server-side
 * (cart, address, variants, inventory, delivery zone, coupon/reward) and
 * NEVER trusts a client-supplied price, stock, discount, or total —
 * mirroring `backend/src/modules/orders/orders.service.ts`'s `create()`,
 * with one deliberate structural improvement: Express blind-decrements
 * `Inventory.stock` with no floor guard (a real race window between two
 * concurrent last-unit checkouts); this port guards every decrement with
 * `consumeStockForOrder`, which throws `InsufficientStockError` rather
 * than allowing negative stock.
 *
 * Not ported from Express: the wallet-redemption step. Phase 5's own
 * scope list (checkout: "selected address, COD, Razorpay, global coupon,
 * reward coupon, delivery fee, convenience fee, GST calculation, order
 * notes") does not mention wallet — this is a deliberate scope exclusion,
 * not an oversight (see the Phase 5 completion report).
 */

function cartItemsCollection(uid: string) {
  return db.collection('carts').doc(uid).collection('items');
}
function variantRef(variantId: string) {
  return db.collection('productVariants').doc(variantId);
}
function inventoryRef(variantId: string) {
  return db.collection('inventory').doc(variantId);
}
function ordersCollection() {
  return db.collection('orders');
}
function orderItemsCollection(orderId: string) {
  return ordersCollection().doc(orderId).collection('items');
}
function orderStatusHistoryCollection(orderId: string) {
  return ordersCollection().doc(orderId).collection('statusHistory');
}
function paymentRecordsCollection() {
  return db.collection('paymentRecords');
}
function couponUsagesCollection() {
  return db.collection('couponUsages');
}
function rewardCouponsCollection() {
  return db.collection('rewardCoupons');
}
function orderIdempotencyCollection() {
  return db.collection('orderIdempotency');
}

/** Internal-only — signals the order-number doc was already taken; triggers a fresh attempt with a new number. */
class OrderNumberCollisionError extends Error {}

function toCouponEvalShape(c: FirestoreCouponDoc): CouponEvalShape {
  return {
    type: c.type,
    value: c.value,
    minOrderPaise: c.minOrderPaise,
    maxDiscountPaise: c.maxDiscountPaise,
    usageLimit: c.usageLimit,
    usedCount: c.usedCount,
    perUserLimit: c.perUserLimit,
    startsAt: c.startsAt.toDate(),
    expiresAt: c.expiresAt ? c.expiresAt.toDate() : null,
    isActive: c.isActive,
  };
}

function toRewardEvalShape(r: FirestoreRewardCouponDoc): RewardCouponEvalShape {
  return {
    userId: r.userId,
    status: r.status,
    expiresAt: r.expiresAt.toDate(),
    minOrderPaise: r.minOrderPaise,
    cashbackAmountPaise: r.cashbackAmountPaise,
  };
}

const createOrderSchema = z.object({
  addressId: z.string().min(1),
  paymentMethod: z.enum(['COD', 'RAZORPAY']),
  couponCode: z.string().max(40).nullish().transform((v) => v ?? null),
  notes: z.string().max(300).nullish().transform((v) => v ?? null),
  // Client-generated (e.g. a UUID) and stable across retries of the SAME
  // checkout attempt — this is what makes a network-blip double-submit a
  // no-op instead of a duplicate order. A fresh key must be used for a
  // genuinely new checkout attempt.
  idempotencyKey: z.string().min(8).max(100),
});
export type CreateOrderInput = z.output<typeof createOrderSchema>;

interface PlaceOrderResult {
  orderId: string;
  alreadyProcessed: boolean;
  totalPaise: number;
  paymentMethod: 'COD' | 'RAZORPAY';
}

async function runPlaceOrderTransaction(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  orderNumber: string,
  input: CreateOrderInput,
): Promise<PlaceOrderResult> {
  // ── Reads (all before any write, per Firestore transaction rules) ──────
  const idempRef = orderIdempotencyCollection().doc(input.idempotencyKey);
  const idempSnap = await tx.get(idempRef);
  if (idempSnap.exists) {
    const existingOrderId = idempSnap.data()!.orderId as string;
    const existingSnap = await tx.get(ordersCollection().doc(existingOrderId));
    if (existingSnap.exists) {
      const existing = existingSnap.data() as FirestoreOrderDoc;
      return { orderId: existingOrderId, alreadyProcessed: true, totalPaise: existing.totalPaise, paymentMethod: existing.paymentMethod };
    }
    throw new ConflictError('Order could not be created, please try again');
  }

  const orderRef = ordersCollection().doc(orderNumber);
  const orderSnap = await tx.get(orderRef);
  if (orderSnap.exists) throw new OrderNumberCollisionError();

  const addressRef = db.collection('addresses').doc(input.addressId);
  const addressSnap = await tx.get(addressRef);
  if (!addressSnap.exists || (addressSnap.data() as FirestoreAddressDoc).userId !== uid) {
    throw new NotFoundError('Address not found');
  }
  const address = addressSnap.data() as FirestoreAddressDoc;

  const cartItemsSnap = await tx.get(cartItemsCollection(uid));
  if (cartItemsSnap.empty) throw new BadRequestError('Your cart is empty');
  const cartItems = cartItemsSnap.docs.map((d) => d.data() as FirestoreCartItemDoc);

  const variantRefs = cartItems.map((i) => variantRef(i.variantId));
  const invRefs = cartItems.map((i) => inventoryRef(i.variantId));
  const [variantSnaps, inventorySnaps] = await Promise.all([
    Promise.all(variantRefs.map((r) => tx.get(r))),
    Promise.all(invRefs.map((r) => tx.get(r))),
  ]);
  const productIds = [
    ...new Set(variantSnaps.filter((s) => s.exists).map((s) => (s.data() as FirestoreVariantDoc).productId)),
  ];
  const productSnaps = await Promise.all(productIds.map((id) => tx.get(db.collection('products').doc(id))));
  const productById = new Map(productSnaps.filter((s) => s.exists).map((s) => [s.id, s.data() as FirestoreProductDoc]));

  const pincodeRef = db.collection('serviceablePincodes').doc(address.pincode);
  const pincodeSnap = await tx.get(pincodeRef);
  const UNSERVICEABLE_MESSAGE = 'Sorry, TSG eCart currently delivers only within Hyderabad.';
  if (!pincodeSnap.exists) throw new BadRequestError(UNSERVICEABLE_MESSAGE);
  const pincodeDoc = pincodeSnap.data() as FirestoreServiceablePincodeDoc;
  if (!pincodeDoc.isServiceable || !pincodeDoc.zoneId) throw new BadRequestError(UNSERVICEABLE_MESSAGE);
  const zoneRef = db.collection('deliveryZones').doc(pincodeDoc.zoneId);
  const zoneSnap = await tx.get(zoneRef);
  if (!zoneSnap.exists || !(zoneSnap.data() as FirestoreDeliveryZoneDoc).isActive) {
    throw new BadRequestError(UNSERVICEABLE_MESSAGE);
  }
  const zone = zoneSnap.data() as FirestoreDeliveryZoneDoc;

  let couponSnap: FirebaseFirestore.DocumentSnapshot | null = null;
  let couponUsageCount = 0;
  let rewardSnap: FirebaseFirestore.DocumentSnapshot | null = null;
  const upperCode = input.couponCode ? input.couponCode.toUpperCase() : null;
  if (upperCode) {
    couponSnap = await tx.get(db.collection('coupons').doc(upperCode));
    if (couponSnap.exists) {
      const usageQuerySnap = await tx.get(couponUsagesCollection().where('couponCode', '==', upperCode).where('userId', '==', uid));
      couponUsageCount = usageQuerySnap.size;
    } else {
      rewardSnap = await tx.get(rewardCouponsCollection().doc(upperCode));
      if (!rewardSnap.exists) throw new BadRequestError('Invalid coupon code');
    }
  }

  // ── Validate + compute (pure, no Firestore calls below this point) ─────
  const orderLines: FirestoreOrderItemDoc[] = [];
  const consumptions: Array<{ ref: FirebaseFirestore.DocumentReference; variantRef: FirebaseFirestore.DocumentReference; quantity: number; inventory: FirestoreInventoryDoc }> = [];
  for (let i = 0; i < cartItems.length; i++) {
    const item = cartItems[i];
    const variantSnap = variantSnaps[i];
    if (!variantSnap.exists) throw new BadRequestError('One of the items in your cart is no longer available');
    const variant = variantSnap.data() as FirestoreVariantDoc;
    const product = productById.get(variant.productId);
    if (!variant.isActive || !product || !product.isActive) {
      throw new BadRequestError('One of the items in your cart is no longer available');
    }
    const inventorySnap = inventorySnaps[i];
    if (!inventorySnap.exists) throw new NotFoundError('Inventory record not found');
    const inventory = inventorySnap.data() as FirestoreInventoryDoc;

    orderLines.push({
      variantId: item.variantId,
      productName: product.name,
      variantLabel: variant.unitLabel,
      sku: item.variantId,
      imageUrl: product.images[0] ?? null,
      unitPricePaise: variant.pricePaise,
      gstRatePercent: product.gstRatePercent,
      quantity: item.quantity,
      lineTotalPaise: computeLineTotalPaise(variant.pricePaise, item.quantity),
    });
    consumptions.push({ ref: invRefs[i], variantRef: variantRefs[i], quantity: item.quantity, inventory });
  }

  let discountPaise = 0;
  let couponCode: string | null = null;
  let rewardCouponCode: string | null = null;
  const subtotalForCoupon = orderLines.reduce((s, l) => s + l.lineTotalPaise, 0);
  if (upperCode && couponSnap?.exists) {
    const coupon = couponSnap.data() as FirestoreCouponDoc;
    const result = evaluateGlobalCoupon({
      coupon: toCouponEvalShape(coupon),
      subtotalPaise: subtotalForCoupon,
      userUsageCount: couponUsageCount,
    });
    discountPaise = result.discountPaise;
    couponCode = upperCode;
  } else if (upperCode && rewardSnap?.exists) {
    const reward = rewardSnap.data() as FirestoreRewardCouponDoc;
    const result = evaluateRewardCoupon({
      rewardCoupon: toRewardEvalShape(reward),
      callerUid: uid,
      subtotalPaise: subtotalForCoupon,
    });
    discountPaise = result.discountPaise;
    rewardCouponCode = reward.code;
  }

  const deliveryChargePaise = computeDeliveryChargePaise(zone, subtotalForCoupon);
  const totals = computeOrderTotals(orderLines, discountPaise, deliveryChargePaise);

  const stockConsumptions = consumptions.map((c) => ({ ...c, result: consumeStockForOrder(c.inventory, c.quantity) }));

  const isFullyDiscounted = totals.totalPaise <= 0;
  const paymentStatus = isFullyDiscounted ? 'PAID' : 'PENDING';
  const orderStatus: OrderStatus = 'CONFIRMED';
  const now = FieldValue.serverTimestamp();

  // ── Writes ───────────────────────────────────────────────────────────
  const orderDoc: FirestoreOrderDoc = {
    userId: uid,
    orderNumber,
    status: orderStatus,
    paymentStatus,
    paymentMethod: input.paymentMethod,
    shipContactName: address.contactName,
    shipContactPhone: address.contactPhone,
    shipLine1: address.line1,
    shipLine2: address.line2,
    shipLandmark: address.landmark,
    shipPincode: address.pincode,
    shipCity: address.city,
    shipState: address.state,
    subtotalPaise: totals.subtotalPaise,
    discountPaise: totals.discountPaise,
    taxPaise: totals.taxPaise,
    deliveryChargePaise: totals.deliveryChargePaise,
    convenienceFeePaise: totals.convenienceFeePaise,
    totalPaise: totals.totalPaise,
    couponCode,
    rewardCouponCode,
    deliveryZoneId: pincodeDoc.zoneId,
    etaMinMinutes: zone.minEtaMinutes,
    etaMaxMinutes: zone.maxEtaMinutes,
    notes: input.notes,
    placedAt: now as unknown as Timestamp,
    deliveredAt: null,
    cancelledAt: null,
    createdAt: now as unknown as Timestamp,
    updatedAt: now as unknown as Timestamp,
  };
  tx.set(orderRef, orderDoc);

  for (const line of orderLines) {
    tx.set(orderItemsCollection(orderNumber).doc(), line);
  }

  const initialHistory: FirestoreOrderStatusHistoryDoc = { status: orderStatus, note: 'Order placed', createdAt: now as unknown as Timestamp };
  tx.set(orderStatusHistoryCollection(orderNumber).doc(), initialHistory);

  const paymentDoc: FirestorePaymentRecordDoc = {
    userId: uid,
    orderId: orderNumber,
    method: input.paymentMethod,
    status: paymentStatus,
    amountPaise: totals.totalPaise,
    currency: 'INR',
    razorpayOrderId: null,
    razorpayPaymentId: null,
    razorpaySignature: null,
    refundId: null,
    refundedAmountPaise: 0,
    paidAt: isFullyDiscounted ? (now as unknown as Timestamp) : null,
    createdAt: now as unknown as Timestamp,
    updatedAt: now as unknown as Timestamp,
  };
  tx.set(paymentRecordsCollection().doc(orderNumber), paymentDoc);

  for (const c of stockConsumptions) {
    tx.update(c.ref, { stock: c.result.newStock, reserved: c.result.newReserved, isLowStock: c.result.newIsLowStock, updatedAt: now });
    tx.update(c.variantRef, { availableStock: c.result.newAvailableStock, updatedAt: now });
  }

  if (couponCode && couponSnap) {
    tx.set(couponUsagesCollection().doc(), { couponCode, userId: uid, orderId: orderNumber, createdAt: now });
    tx.update(couponSnap.ref, { usedCount: FieldValue.increment(1), updatedAt: now });
  }
  if (rewardCouponCode && rewardSnap) {
    tx.update(rewardSnap.ref, { status: 'REDEEMED', redeemedOrderId: orderNumber, redeemedAt: now });
  }

  for (const doc of cartItemsSnap.docs) {
    tx.delete(doc.ref);
  }

  tx.set(idempRef, { orderId: orderNumber, createdAt: now });

  return { orderId: orderNumber, alreadyProcessed: false, totalPaise: totals.totalPaise, paymentMethod: input.paymentMethod };
}

export async function placeOrderTx(uid: string, input: CreateOrderInput): Promise<PlaceOrderResult> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const orderNumber = generateOrderNumber();
    try {
      return await db.runTransaction((tx) => runPlaceOrderTransaction(tx, uid, orderNumber, input));
    } catch (err) {
      if (err instanceof OrderNumberCollisionError) continue;
      throw err;
    }
  }
  throw new ConflictError('Could not generate a unique order number, please try again');
}

let razorpayClientOverride: RazorpayClient | null = null;
/** Test-only seam — never called from production code. */
export function __setRazorpayClientForTests(client: RazorpayClient | null): void {
  razorpayClientOverride = client;
}

function getRazorpayClient(): RazorpayClient {
  if (razorpayClientOverride) return razorpayClientOverride;
  return createRealRazorpayClient(razorpayKeyIdSecret.value(), razorpayKeySecretSecret.value());
}

function isRazorpayConfigured(): boolean {
  try {
    return Boolean(razorpayKeyIdSecret.value() && razorpayKeySecretSecret.value());
  } catch {
    return false;
  }
}

export async function attachRazorpayOrder(
  orderId: string,
  totalPaise: number,
): Promise<{ razorpayOrderId: string; amountPaise: number; currency: string; keyId: string }> {
  if (!isRazorpayConfigured() && !razorpayClientOverride) {
    throw new BadRequestError('Online payment is not available right now. Please use Cash on Delivery.');
  }
  const client = getRazorpayClient();
  const order = await client.createOrder({ amountPaise: totalPaise, currency: 'INR', receipt: orderId, notes: { orderId } });
  await paymentRecordsCollection().doc(orderId).update({ razorpayOrderId: order.id, updatedAt: FieldValue.serverTimestamp() });
  return { razorpayOrderId: order.id, amountPaise: totalPaise, currency: 'INR', keyId: razorpayKeyIdSecret.value() };
}

async function orderResponseFromRefs(orderId: string): Promise<OrderResponse> {
  const [orderSnap, itemsSnap, historySnap] = await Promise.all([
    ordersCollection().doc(orderId).get(),
    orderItemsCollection(orderId).get(),
    orderStatusHistoryCollection(orderId).orderBy('createdAt', 'asc').get(),
  ]);
  const order = orderSnap.data() as FirestoreOrderDoc;
  return {
    ...order,
    id: orderId,
    placedAt: order.placedAt.toDate().toISOString(),
    deliveredAt: order.deliveredAt ? order.deliveredAt.toDate().toISOString() : null,
    cancelledAt: order.cancelledAt ? order.cancelledAt.toDate().toISOString() : null,
    createdAt: order.createdAt.toDate().toISOString(),
    updatedAt: order.updatedAt.toDate().toISOString(),
    items: itemsSnap.docs.map((d) => ({ ...(d.data() as FirestoreOrderItemDoc), id: d.id })),
    statusHistory: historySnap.docs.map((d) => {
      const h = d.data() as FirestoreOrderStatusHistoryDoc;
      return { ...h, id: d.id, createdAt: h.createdAt.toDate().toISOString() };
    }),
  };
}

export const createOrder = onCall({ secrets: [razorpayKeyIdSecret, razorpayKeySecretSecret] }, async (request: CallableRequest) => {
  try {
    const caller = requireAuthenticatedCaller(request);
    const input = parseInput(createOrderSchema, request.data);
    const result = await placeOrderTx(caller.uid, input);

    let razorpay: { razorpayOrderId: string; amountPaise: number; currency: string; keyId: string } | null = null;
    if (!result.alreadyProcessed && result.paymentMethod === 'RAZORPAY' && result.totalPaise > 0) {
      razorpay = await attachRazorpayOrder(result.orderId, result.totalPaise);
    }

    const order = await orderResponseFromRefs(result.orderId);
    return { order, razorpay };
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

async function restockOrderItemsInTx(tx: FirebaseFirestore.Transaction, orderId: string): Promise<void> {
  const itemsSnap = await tx.get(orderItemsCollection(orderId));
  const items = itemsSnap.docs.map((d) => d.data() as FirestoreOrderItemDoc);
  const invRefs = items.map((i) => inventoryRef(i.variantId));
  const varRefs = items.map((i) => variantRef(i.variantId));
  const [invSnaps, varSnaps] = await Promise.all([Promise.all(invRefs.map((r) => tx.get(r))), Promise.all(varRefs.map((r) => tx.get(r)))]);

  const now = FieldValue.serverTimestamp();
  for (let i = 0; i < items.length; i++) {
    if (!invSnaps[i].exists) continue; // hard-deleted since the order was placed — nothing to restock
    const inv = invSnaps[i].data() as FirestoreInventoryDoc;
    const restocked = restockInventory(inv, items[i].quantity);
    tx.update(invRefs[i], { stock: restocked.newStock, isLowStock: restocked.newIsLowStock, updatedAt: now });
    if (varSnaps[i].exists) {
      tx.update(varRefs[i], { availableStock: computeAvailable(restocked.newStock, inv.reserved), updatedAt: now });
    }
  }
}

export async function cancelOrderTx(uid: string, orderId: string): Promise<void> {
  await db.runTransaction(async (tx) => {
    const orderRef = ordersCollection().doc(orderId);
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists || (orderSnap.data() as FirestoreOrderDoc).userId !== uid) {
      throw new NotFoundError('Order not found');
    }
    const order = orderSnap.data() as FirestoreOrderDoc;
    if (!CUSTOMER_CANCELLABLE_STATUSES.includes(order.status)) {
      throw new ConflictError(`Cannot cancel an order in ${order.status} status`);
    }

    await restockOrderItemsInTx(tx, orderId);

    const now = FieldValue.serverTimestamp();
    tx.update(orderRef, { status: 'CANCELLED', cancelledAt: now, updatedAt: now });
    tx.set(orderStatusHistoryCollection(orderId).doc(), { status: 'CANCELLED', note: 'Cancelled by customer', createdAt: now });
  });
}

const cancelOrderSchema = z.object({ orderId: z.string().min(1) });

export const cancelOrder = onCall(async (request: CallableRequest) => {
  try {
    const caller = requireAuthenticatedCaller(request);
    const { orderId } = parseInput(cancelOrderSchema, request.data);
    await cancelOrderTx(caller.uid, orderId);
    return { cancelled: true };
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

export async function adminUpdateOrderStatusTx(orderId: string, newStatus: OrderStatus, note: string | null): Promise<void> {
  await db.runTransaction(async (tx) => {
    const orderRef = ordersCollection().doc(orderId);
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) throw new NotFoundError('Order not found');
    const order = orderSnap.data() as FirestoreOrderDoc;
    if (!canTransitionOrderStatus(order.status, newStatus)) {
      throw new ConflictError(`Cannot move order from ${order.status} to ${newStatus}`);
    }

    let paymentRef: FirebaseFirestore.DocumentReference | null = null;
    let paymentIsPendingCod = false;
    if (newStatus === 'DELIVERED' && order.paymentStatus === 'PENDING') {
      paymentRef = paymentRecordsCollection().doc(orderId);
      const paymentSnap = await tx.get(paymentRef);
      paymentIsPendingCod = paymentSnap.exists && (paymentSnap.data() as FirestorePaymentRecordDoc).method === 'COD';
    }

    if (newStatus === 'CANCELLED') {
      await restockOrderItemsInTx(tx, orderId);
    }

    const now = FieldValue.serverTimestamp();
    const updates: Record<string, unknown> = { status: newStatus, updatedAt: now };
    if (newStatus === 'DELIVERED') {
      updates.deliveredAt = now;
      if (paymentIsPendingCod && paymentRef) {
        updates.paymentStatus = 'PAID';
        tx.update(paymentRef, { status: 'PAID', paidAt: now, updatedAt: now });
      }
    }
    if (newStatus === 'CANCELLED') {
      updates.cancelledAt = now;
    }
    tx.update(orderRef, updates);
    tx.set(orderStatusHistoryCollection(orderId).doc(), { status: newStatus, note, createdAt: now });
  });
}

const adminUpdateOrderStatusSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(['CONFIRMED', 'PREPARING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']),
  note: z.string().max(300).nullish().transform((v) => v ?? null),
});

export const adminUpdateOrderStatus = onCall(async (request: CallableRequest) => {
  try {
    requirePermission(request, 'orders.manage');
    const { orderId, status, note } = parseInput(adminUpdateOrderStatusSchema, request.data);
    await adminUpdateOrderStatusTx(orderId, status, note);
    return { updated: true };
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

const createRazorpayOrderSchema = z.object({ orderId: z.string().min(1) });

export const createRazorpayOrder = onCall({ secrets: [razorpayKeyIdSecret, razorpayKeySecretSecret] }, async (request: CallableRequest) => {
  try {
    const caller = requireAuthenticatedCaller(request);
    const { orderId } = parseInput(createRazorpayOrderSchema, request.data);
    const orderSnap = await ordersCollection().doc(orderId).get();
    if (!orderSnap.exists || (orderSnap.data() as FirestoreOrderDoc).userId !== caller.uid) {
      throw new NotFoundError('Order not found');
    }
    const order = orderSnap.data() as FirestoreOrderDoc;
    if (order.paymentMethod !== 'RAZORPAY') throw new BadRequestError('This order is not payable online');
    if (order.paymentStatus === 'PAID') throw new BadRequestError('This order has already been paid');

    const paymentSnap = await paymentRecordsCollection().doc(orderId).get();
    const payment = paymentSnap.data() as FirestorePaymentRecordDoc;
    if (payment.razorpayOrderId) {
      return { razorpayOrderId: payment.razorpayOrderId, amountPaise: payment.amountPaise, currency: payment.currency, keyId: razorpayKeyIdSecret.value() };
    }
    return await attachRazorpayOrder(orderId, order.totalPaise);
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});
