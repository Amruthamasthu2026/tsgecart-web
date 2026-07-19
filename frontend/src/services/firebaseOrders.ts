import { httpsCallable } from 'firebase/functions';
import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { firebaseFunctions, firebaseFirestore } from '../lib/firebase';
import type { Order, OrderItem, OrderStatus, OrderStatusHistory, CreateOrderResult } from '../features/orders/orders.api';
import type { CartSummary, CheckoutSummary } from '../features/cart/cart.api';
import { firebaseCouponsApi } from './firebaseCoupons';

/**
 * Firestore-backed checkout/orders service — added ALONGSIDE
 * `features/orders/orders.api.ts` (untouched). Order CREATION, CANCELLATION,
 * and Razorpay attach/verify all go through Callable Functions
 * (`firebase/functions/src/orders/orders.function.ts`,
 * `payments/razorpay.function.ts`) — the entire authoritative total
 * (price/GST/discount/delivery) is recomputed server-side inside one
 * Firestore transaction and never trusted from this client. Order READS
 * (list/detail) go straight to Firestore (owner-only Security Rule), same
 * pattern as `firebaseAddresses.ts`.
 *
 * See `VITE_USE_FIRESTORE_CHECKOUT` / `VITE_USE_FIRESTORE_ORDERS`
 * (frontend/.env.example).
 */

interface FirestoreOrderItemResponse {
  id: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  sku: string;
  imageUrl: string | null;
  unitPricePaise: number;
  gstRatePercent: number;
  quantity: number;
  lineTotalPaise: number;
}

interface FirestoreOrderStatusHistoryResponse {
  id: string;
  status: OrderStatus;
  note: string | null;
  createdAt: string;
}

export interface FirestoreOrderResponse {
  id: string;
  userId: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: string;
  paymentMethod: 'COD' | 'RAZORPAY';
  shipContactName: string;
  shipContactPhone: string;
  shipLine1: string;
  shipLine2: string | null;
  shipLandmark: string | null;
  shipPincode: string;
  shipCity: string;
  shipState: string;
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  deliveryChargePaise: number;
  convenienceFeePaise: number;
  totalPaise: number;
  couponCode: string | null;
  rewardCouponCode: string | null;
  etaMinMinutes: number | null;
  etaMaxMinutes: number | null;
  notes: string | null;
  placedAt: string;
  deliveredAt: string | null;
  cancelledAt: string | null;
  items: FirestoreOrderItemResponse[];
  statusHistory: FirestoreOrderStatusHistoryResponse[];
}

export interface FirestoreCreateOrderResult {
  order: FirestoreOrderResponse;
  razorpay: { razorpayOrderId: string; amountPaise: number; currency: string; keyId: string } | null;
}

const createOrderCallable = httpsCallable<
  { addressId: string; paymentMethod: 'COD' | 'RAZORPAY'; couponCode?: string | null; notes?: string | null; idempotencyKey: string },
  FirestoreCreateOrderResult
>(firebaseFunctions, 'createOrder');
const cancelOrderCallable = httpsCallable<{ orderId: string }, { cancelled: true }>(firebaseFunctions, 'cancelOrder');
const createRazorpayOrderCallable = httpsCallable<
  { orderId: string },
  { razorpayOrderId: string; amountPaise: number; currency: string; keyId: string }
>(firebaseFunctions, 'createRazorpayOrder');
const verifyRazorpayPaymentCallable = httpsCallable<
  { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
  { verified: true }
>(firebaseFunctions, 'verifyRazorpayPayment');

function paiseToRupeeString(paise: number): string {
  return (paise / 100).toFixed(2);
}

function toLegacyOrderItem(item: FirestoreOrderItemResponse): OrderItem {
  return {
    id: item.id,
    productName: item.productName,
    variantLabel: item.variantLabel,
    sku: item.sku,
    imageUrl: item.imageUrl,
    unitPrice: paiseToRupeeString(item.unitPricePaise),
    quantity: item.quantity,
    lineTotal: paiseToRupeeString(item.lineTotalPaise),
  };
}

function toLegacyStatusHistory(h: FirestoreOrderStatusHistoryResponse): OrderStatusHistory {
  return { id: h.id, status: h.status, note: h.note, createdAt: h.createdAt };
}

/** Reshapes a Firestore order into the exact `Order` shape the existing pages already render. */
export function toLegacyOrder(fsOrder: FirestoreOrderResponse): Order {
  return {
    id: fsOrder.id,
    orderNumber: fsOrder.orderNumber,
    status: fsOrder.status,
    paymentStatus: fsOrder.paymentStatus,
    subtotal: paiseToRupeeString(fsOrder.subtotalPaise),
    discount: paiseToRupeeString(fsOrder.discountPaise),
    taxTotal: paiseToRupeeString(fsOrder.taxPaise),
    deliveryCharge: paiseToRupeeString(fsOrder.deliveryChargePaise),
    total: paiseToRupeeString(fsOrder.totalPaise),
    etaMinMinutes: fsOrder.etaMinMinutes,
    etaMaxMinutes: fsOrder.etaMaxMinutes,
    placedAt: fsOrder.placedAt,
    shipContactName: fsOrder.shipContactName,
    shipContactPhone: fsOrder.shipContactPhone,
    shipLine1: fsOrder.shipLine1,
    shipLine2: fsOrder.shipLine2,
    shipPincode: fsOrder.shipPincode,
    shipCity: fsOrder.shipCity,
    items: fsOrder.items.map(toLegacyOrderItem),
    statusHistory: fsOrder.statusHistory.map(toLegacyStatusHistory),
    payment: { method: fsOrder.paymentMethod, status: fsOrder.paymentStatus },
  };
}

/** Reshapes a Firestore `createOrder` result into the exact `CreateOrderResult` shape `CheckoutPage` already renders. */
export function toLegacyCreateOrderResult(result: FirestoreCreateOrderResult): CreateOrderResult {
  return {
    order: toLegacyOrder(result.order),
    razorpay: result.razorpay
      ? {
          orderId: result.razorpay.razorpayOrderId,
          amount: result.razorpay.amountPaise,
          currency: result.razorpay.currency,
          keyId: result.razorpay.keyId,
        }
      : null,
  };
}

async function fetchOrder(orderId: string, includeStatusHistory: boolean): Promise<FirestoreOrderResponse | null> {
  const orderRef = doc(firebaseFirestore, 'orders', orderId);
  const [orderSnap, itemsSnap, historySnap] = await Promise.all([
    getDoc(orderRef),
    getDocs(collection(firebaseFirestore, 'orders', orderId, 'items')),
    includeStatusHistory
      ? getDocs(query(collection(firebaseFirestore, 'orders', orderId, 'statusHistory'), orderBy('createdAt', 'asc')))
      : Promise.resolve(null),
  ]);
  if (!orderSnap.exists()) return null;
  const data = orderSnap.data();
  return {
    id: orderSnap.id,
    ...(data as Omit<FirestoreOrderResponse, 'id' | 'items' | 'statusHistory' | 'placedAt' | 'deliveredAt' | 'cancelledAt'>),
    placedAt: data.placedAt.toDate().toISOString(),
    deliveredAt: data.deliveredAt ? data.deliveredAt.toDate().toISOString() : null,
    cancelledAt: data.cancelledAt ? data.cancelledAt.toDate().toISOString() : null,
    items: itemsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FirestoreOrderItemResponse, 'id'>) })),
    statusHistory: historySnap
      ? historySnap.docs.map((d) => {
          const h = d.data();
          return { id: d.id, status: h.status, note: h.note, createdAt: h.createdAt.toDate().toISOString() };
        })
      : [],
  };
}

const UNSERVICEABLE_MESSAGE = 'Sorry, TSG eCart currently delivers only within Hyderabad.';

/**
 * Display-only preview: reads `serviceablePincodes`/`deliveryZones`
 * directly (both public-read, matching `products`/`categories`) and — if a
 * coupon code is given — calls the `validateCoupon` Callable for a
 * discount preview. NONE of this is authoritative; `createOrder` always
 * re-validates the pincode and re-evaluates the coupon itself inside its
 * own transaction, exactly mirroring how the existing Express
 * `checkoutSummary` preview and `orders.service.ts`'s real re-check are
 * two separate code paths today.
 */
async function checkPincodeServiceability(pincode: string, cartSummary: CartSummary, couponCode?: string): Promise<CheckoutSummary> {
  const pincodeSnap = await getDoc(doc(firebaseFirestore, 'serviceablePincodes', pincode));
  if (!pincodeSnap.exists() || !pincodeSnap.data().isServiceable || !pincodeSnap.data().zoneId) {
    return { summary: cartSummary, serviceable: false, message: UNSERVICEABLE_MESSAGE, deliveryCharge: 0, discount: 0, total: cartSummary.subtotal };
  }
  const zoneId = pincodeSnap.data().zoneId as string;
  const zoneSnap = await getDoc(doc(firebaseFirestore, 'deliveryZones', zoneId));
  if (!zoneSnap.exists() || !zoneSnap.data().isActive) {
    return { summary: cartSummary, serviceable: false, message: UNSERVICEABLE_MESSAGE, deliveryCharge: 0, discount: 0, total: cartSummary.subtotal };
  }
  const zone = zoneSnap.data();
  const deliveryChargePaise: number = zone.deliveryChargePaise;
  const freeDeliveryLimitPaise: number = zone.freeDeliveryLimitPaise;
  const subtotalPaise = Math.round(cartSummary.subtotal * 100);
  const deliveryCharge =
    freeDeliveryLimitPaise > 0 && subtotalPaise >= freeDeliveryLimitPaise ? 0 : deliveryChargePaise / 100;

  let discount = 0;
  let resolvedCouponCode: string | undefined;
  if (couponCode) {
    try {
      const applied = await firebaseCouponsApi.validate(couponCode, cartSummary.subtotal);
      discount = applied.coupon.discount;
      resolvedCouponCode = applied.coupon.code;
    } catch {
      // Invalid/expired coupon — surfaced to the user by the coupon input's
      // own error state (CheckoutPage), not by failing the whole preview.
    }
  }

  return {
    summary: cartSummary,
    serviceable: true,
    message: 'Delivery available',
    deliveryCharge,
    discount,
    couponCode: resolvedCouponCode,
    eta: { min: zone.minEtaMinutes, max: zone.maxEtaMinutes },
    total: Math.max(0, cartSummary.subtotal - discount) + deliveryCharge,
    zoneId,
  };
}

export const firebaseOrdersApi = {
  checkPincodeServiceability,

  async createOrder(payload: {
    addressId: string;
    paymentMethod: 'COD' | 'RAZORPAY';
    couponCode?: string | null;
    notes?: string | null;
  }): Promise<CreateOrderResult> {
    const idempotencyKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const result = await createOrderCallable({ ...payload, idempotencyKey });
    return toLegacyCreateOrderResult(result.data);
  },

  async listOrders(uid: string): Promise<Order[]> {
    const snap = await getDocs(
      query(collection(firebaseFirestore, 'orders'), where('userId', '==', uid), orderBy('placedAt', 'desc')),
    );
    const orders = await Promise.all(snap.docs.map((d) => fetchOrder(d.id, false)));
    return orders.filter((o): o is FirestoreOrderResponse => o !== null).map(toLegacyOrder);
  },

  async getOrder(orderId: string): Promise<Order | null> {
    const detail = await fetchOrder(orderId, true);
    return detail ? toLegacyOrder(detail) : null;
  },

  async cancelOrder(orderId: string): Promise<void> {
    await cancelOrderCallable({ orderId });
  },

  async createRazorpayOrder(orderId: string): Promise<{ orderId: string; amount: number; currency: string; keyId: string }> {
    const result = await createRazorpayOrderCallable({ orderId });
    return { orderId: result.data.razorpayOrderId, amount: result.data.amountPaise, currency: result.data.currency, keyId: result.data.keyId };
  },

  async verifyPayment(payload: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }): Promise<void> {
    await verifyRazorpayPaymentCallable(payload);
  },
};

/** True when checkout (order creation) should write to Firestore instead of the Express API. */
export const useFirestoreCheckout = import.meta.env.VITE_USE_FIRESTORE_CHECKOUT === 'true';
/** True when the orders list/detail pages should read from Firestore instead of the Express API. */
export const useFirestoreOrders = import.meta.env.VITE_USE_FIRESTORE_ORDERS === 'true';
/** True when the Firestore checkout flow may offer RAZORPAY (not just COD) as a payment method. */
export const useFirebaseRazorpay = import.meta.env.VITE_USE_FIREBASE_RAZORPAY === 'true';
