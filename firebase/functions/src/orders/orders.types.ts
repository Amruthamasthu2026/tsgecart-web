import type { Timestamp } from 'firebase-admin/firestore';

/**
 * Firestore port of the order/payment domain, per
 * docs/firebase-migration-audit.md §30. Doc ID design follows the audit's
 * explicit recommendation: `orders/{orderId}` uses the human-readable
 * order number itself as the doc ID ("already globally unique by
 * construction, no separate auto-ID needed") — see
 * `orders.logic.ts`'s `generateOrderNumber` + the collision-retry loop in
 * `orders.function.ts`. Items and status history are subcollections, not
 * embedded arrays (audit §30: "do not put entire order histories inside a
 * user document"). `paymentRecords/{orderId}` is a separate top-level
 * collection (not a subcollection of `orders`) specifically so Security
 * Rules can be reasoned about independently for payment internals.
 *
 * Enum values match the real Prisma schema exactly — including that there
 * is no `PLACED` status; `CONFIRMED` is the initial status for both COD and
 * Razorpay orders in the existing system, so that's what's preserved here.
 */
export type OrderStatus = 'CONFIRMED' | 'PREPARING' | 'PACKED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
export type PaymentMethod = 'COD' | 'RAZORPAY';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';

export interface FirestoreOrderDoc {
  userId: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  // Shipping address snapshot — survives later edits/deletes of the source
  // `addresses/{addressId}` doc, exactly matching Prisma `Order.ship*`.
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
  /**
   * No fee schedule exists anywhere in the source Express system (a
   * full-repo grep for "convenience" found nothing) — this field is a
   * forward-compatible stub, always 0 today, not an invented charge.
   */
  convenienceFeePaise: number;
  /** Final payable amount: max(0, subtotal - discount) + delivery + convenienceFee. */
  totalPaise: number;
  couponCode: string | null;
  rewardCouponCode: string | null;
  deliveryZoneId: string | null;
  etaMinMinutes: number | null;
  etaMaxMinutes: number | null;
  notes: string | null;
  placedAt: Timestamp;
  deliveredAt: Timestamp | null;
  cancelledAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** `orders/{orderId}/items/{itemId}` — auto-ID, price/product snapshot at order time. */
export interface FirestoreOrderItemDoc {
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

/** `orders/{orderId}/statusHistory/{historyId}` — auto-ID, one row per status write. */
export interface FirestoreOrderStatusHistoryDoc {
  status: OrderStatus;
  note: string | null;
  createdAt: Timestamp;
}

/** `paymentRecords/{orderId}` — doc ID matches the owning order (1:1). */
export interface FirestorePaymentRecordDoc {
  userId: string;
  orderId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amountPaise: number;
  currency: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  razorpaySignature: string | null;
  refundId: string | null;
  refundedAmountPaise: number;
  paidAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** `orderIdempotency/{idempotencyKey}` — Function/Admin-SDK-only, never client-readable. */
export interface FirestoreOrderIdempotencyDoc {
  orderId: string;
  createdAt: Timestamp;
}

/** `webhookEvents/{eventId}` — Function/Admin-SDK-only dedup marker for the Razorpay webhook. */
export interface FirestoreWebhookEventDoc {
  processedAt: Timestamp;
}

export interface OrderItemResponse extends FirestoreOrderItemDoc {
  id: string;
}

export interface OrderStatusHistoryResponse extends Omit<FirestoreOrderStatusHistoryDoc, 'createdAt'> {
  id: string;
  createdAt: string;
}

export interface OrderResponse
  extends Omit<FirestoreOrderDoc, 'placedAt' | 'deliveredAt' | 'cancelledAt' | 'createdAt' | 'updatedAt'> {
  id: string;
  placedAt: string;
  deliveredAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItemResponse[];
  statusHistory: OrderStatusHistoryResponse[];
}
