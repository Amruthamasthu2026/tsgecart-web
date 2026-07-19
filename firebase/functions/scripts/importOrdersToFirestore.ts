/**
 * NOT EXECUTED AUTOMATICALLY. Imports orders, order items, order status
 * history, and payment records into Firestore from the JSON produced by
 * `backend/scripts/exportOrdersFromMysql.ts` (Firebase migration Phase 5).
 *
 * Safe by default: with no `--execute` flag this is a DRY RUN — it reads,
 * validates, and transforms every record and prints a summary, writing
 * nothing. Idempotent: every write is a deterministic `set()` (order doc ID
 * = orderNumber; item/status-history subcollection doc IDs are derived from
 * `${orderNumber}-item-{index}` / `${orderNumber}-hist-{index}`, not
 * random auto-IDs), so running this script twice with the same input
 * produces the same end state rather than duplicating items.
 *
 * Usage:
 *   npx tsx scripts/importOrdersToFirestore.ts <path-to-export.json>              # dry run (default)
 *   npx tsx scripts/importOrdersToFirestore.ts <path-to-export.json> --execute    # real write
 */
import { readFileSync } from 'node:fs';
import { rupeesToPaise } from '../src/shared/money';
import { logger } from '../src/shared/logger';
import type { FirestoreOrderDoc, FirestoreOrderItemDoc, FirestoreOrderStatusHistoryDoc, FirestorePaymentRecordDoc, OrderStatus, PaymentMethod, PaymentStatus } from '../src/orders/orders.types';

export interface ExportedOrderItem {
  variantId: string | null;
  productName: string;
  variantLabel: string;
  sku: string;
  imageUrl: string | null;
  unitPrice: string;
  gstRate: string;
  quantity: number;
  lineTotal: string;
}
export interface ExportedOrderStatusEvent {
  status: string;
  note: string | null;
  createdAt: string;
}
export interface ExportedPayment {
  method: string;
  status: string;
  amount: string;
  currency: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  razorpaySignature: string | null;
  refundId: string | null;
  refundedAmount: string;
  paidAt: string | null;
}
export interface ExportedOrder {
  orderNumber: string;
  userId: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  shipContactName: string;
  shipContactPhone: string;
  shipLine1: string;
  shipLine2: string | null;
  shipLandmark: string | null;
  shipPincode: string;
  shipCity: string;
  shipState: string;
  subtotal: string;
  discount: string;
  taxTotal: string;
  deliveryCharge: string;
  total: string;
  couponCode: string | null;
  rewardCouponCode: string | null;
  deliveryZoneId: string | null;
  etaMinMinutes: number | null;
  etaMaxMinutes: number | null;
  notes: string | null;
  placedAt: string;
  deliveredAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: ExportedOrderItem[];
  statusHistory: ExportedOrderStatusEvent[];
  payment: ExportedPayment | null;
}

export type FirestoreOrderWrite = Omit<FirestoreOrderDoc, 'placedAt' | 'deliveredAt' | 'cancelledAt' | 'createdAt' | 'updatedAt'> & {
  placedAt: string;
  deliveredAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Pure — no Admin SDK, no file I/O — unit-testable on its own. */
export function toFirestoreOrderDoc(order: ExportedOrder): FirestoreOrderWrite {
  return {
    userId: order.userId,
    orderNumber: order.orderNumber,
    status: order.status as OrderStatus,
    paymentStatus: order.paymentStatus as PaymentStatus,
    paymentMethod: order.paymentMethod as PaymentMethod,
    shipContactName: order.shipContactName,
    shipContactPhone: order.shipContactPhone,
    shipLine1: order.shipLine1,
    shipLine2: order.shipLine2,
    shipLandmark: order.shipLandmark,
    shipPincode: order.shipPincode,
    shipCity: order.shipCity,
    shipState: order.shipState,
    subtotalPaise: rupeesToPaise(order.subtotal),
    discountPaise: rupeesToPaise(order.discount),
    taxPaise: rupeesToPaise(order.taxTotal),
    deliveryChargePaise: rupeesToPaise(order.deliveryCharge),
    convenienceFeePaise: 0,
    totalPaise: rupeesToPaise(order.total),
    couponCode: order.couponCode,
    rewardCouponCode: order.rewardCouponCode,
    deliveryZoneId: order.deliveryZoneId,
    etaMinMinutes: order.etaMinMinutes,
    etaMaxMinutes: order.etaMaxMinutes,
    notes: order.notes,
    placedAt: order.placedAt,
    deliveredAt: order.deliveredAt,
    cancelledAt: order.cancelledAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

/**
 * Pure. Doc ID: `${orderNumber}-item-{index}` — deterministic, idempotent
 * on re-run. `variantId ?? ''` covers a historical MySQL order line whose
 * `ProductVariant` was hard-deleted before export (Prisma's `variantId?`
 * is nullable for exactly this reason) — the Firestore type is
 * non-nullable, so an empty string is the least-surprising placeholder for
 * "this variant no longer exists," matching how `cart.function.ts`
 * already drops a hard-deleted variant from live totals rather than
 * erroring.
 */
export function toFirestoreOrderItemDoc(item: ExportedOrderItem): FirestoreOrderItemDoc {
  return {
    variantId: item.variantId ?? '',
    productName: item.productName,
    variantLabel: item.variantLabel,
    sku: item.sku,
    imageUrl: item.imageUrl,
    unitPricePaise: rupeesToPaise(item.unitPrice),
    gstRatePercent: Number(item.gstRate),
    quantity: item.quantity,
    lineTotalPaise: rupeesToPaise(item.lineTotal),
  };
}

/** Pure. Doc ID: `${orderNumber}-hist-{index}` — deterministic, idempotent on re-run. */
export function toFirestoreOrderStatusHistoryDoc(event: ExportedOrderStatusEvent): Omit<FirestoreOrderStatusHistoryDoc, 'createdAt'> & { createdAt: string } {
  return { status: event.status as OrderStatus, note: event.note, createdAt: event.createdAt };
}

export type FirestorePaymentRecordWrite = Omit<FirestorePaymentRecordDoc, 'paidAt' | 'createdAt' | 'updatedAt'> & {
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Pure. `null` if the exported order had no payment row (should not happen for a real order, but defends against partial data). */
export function toFirestorePaymentRecordDoc(order: ExportedOrder): FirestorePaymentRecordWrite | null {
  if (!order.payment) return null;
  const p = order.payment;
  return {
    userId: order.userId,
    orderId: order.orderNumber,
    method: p.method as PaymentMethod,
    status: p.status as PaymentStatus,
    amountPaise: rupeesToPaise(p.amount),
    currency: p.currency,
    razorpayOrderId: p.razorpayOrderId,
    razorpayPaymentId: p.razorpayPaymentId,
    razorpaySignature: p.razorpaySignature,
    refundId: p.refundId,
    refundedAmountPaise: rupeesToPaise(p.refundedAmount),
    paidAt: p.paidAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export interface ParsedArgs {
  filePath: string;
  execute: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const execute = argv.includes('--execute');
  const filePath = argv.find((a) => !a.startsWith('--'));
  if (!filePath) {
    throw new Error('Usage: importOrdersToFirestore.ts <path-to-export.json> [--execute]');
  }
  return { filePath, execute };
}

async function main(): Promise<void> {
  const { filePath, execute } = parseArgs(process.argv.slice(2));
  const raw = readFileSync(filePath, 'utf8');
  const { orders } = JSON.parse(raw) as { orders: ExportedOrder[] };

  logger.info('Loaded order import records', { count: orders.length });
  console.log(`Loaded ${orders.length} order(s) from ${filePath}.`);
  if (orders[0]) {
    console.log('Sample order:', toFirestoreOrderDoc(orders[0]));
  }

  if (!execute) {
    console.log('\nDRY RUN — nothing was written to Firestore. Re-run with --execute to perform the real import.');
    return;
  }

  const { db } = await import('../src/config/firebaseAdmin');
  const { Timestamp } = await import('firebase-admin/firestore');

  console.log('\nEXECUTING real Firestore writes...');
  let batch = db.batch();
  let opsInBatch = 0;
  const commitIfFull = async () => {
    if (opsInBatch >= 400) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  };
  const queueSet = async (ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData) => {
    batch.set(ref, data);
    opsInBatch += 1;
    await commitIfFull();
  };

  for (const order of orders) {
    const orderDoc = toFirestoreOrderDoc(order);
    await queueSet(db.collection('orders').doc(order.orderNumber), {
      ...orderDoc,
      placedAt: Timestamp.fromDate(new Date(orderDoc.placedAt)),
      deliveredAt: orderDoc.deliveredAt ? Timestamp.fromDate(new Date(orderDoc.deliveredAt)) : null,
      cancelledAt: orderDoc.cancelledAt ? Timestamp.fromDate(new Date(orderDoc.cancelledAt)) : null,
      createdAt: Timestamp.fromDate(new Date(orderDoc.createdAt)),
      updatedAt: Timestamp.fromDate(new Date(orderDoc.updatedAt)),
    });

    for (let i = 0; i < order.items.length; i++) {
      const itemDoc = toFirestoreOrderItemDoc(order.items[i]);
      await queueSet(db.collection('orders').doc(order.orderNumber).collection('items').doc(`${order.orderNumber}-item-${i}`), itemDoc);
    }

    for (let i = 0; i < order.statusHistory.length; i++) {
      const historyDoc = toFirestoreOrderStatusHistoryDoc(order.statusHistory[i]);
      await queueSet(db.collection('orders').doc(order.orderNumber).collection('statusHistory').doc(`${order.orderNumber}-hist-${i}`), {
        ...historyDoc,
        createdAt: Timestamp.fromDate(new Date(historyDoc.createdAt)),
      });
    }

    const paymentDoc = toFirestorePaymentRecordDoc(order);
    if (paymentDoc) {
      await queueSet(db.collection('paymentRecords').doc(order.orderNumber), {
        ...paymentDoc,
        paidAt: paymentDoc.paidAt ? Timestamp.fromDate(new Date(paymentDoc.paidAt)) : null,
        createdAt: Timestamp.fromDate(new Date(paymentDoc.createdAt)),
        updatedAt: Timestamp.fromDate(new Date(paymentDoc.updatedAt)),
      });
    }
  }
  if (opsInBatch > 0) {
    await batch.commit();
  }

  logger.info('Firestore order import complete', { count: orders.length });
  console.log(`Wrote ${orders.length} order(s) with items, status history, and payment records.`);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('Import failed:', err);
    process.exitCode = 1;
  });
}
