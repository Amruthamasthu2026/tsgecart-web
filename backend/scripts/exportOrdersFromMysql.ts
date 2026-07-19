/**
 * READ-ONLY MySQL → Firestore import-ready JSON export for orders, order
 * items, payments, and order status history (Firebase migration Phase 5).
 * This script only SELECTs from the existing database — it never writes to
 * MySQL, never calls any Firebase API, and is NOT wired into any npm
 * lifecycle script that runs automatically.
 *
 * Usage (NOT executed as part of this migration phase):
 *   npm run --workspace backend export:firebase-orders > backend/scripts/output/orders-export.json
 *
 * Output feeds firebase/functions/scripts/importOrdersToFirestore.ts.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
  /**
   * The RAW MySQL `DeliveryZone.id` (a cuid) — Firestore's
   * `deliveryZones/{zoneId}` collection does not yet have an import script
   * of its own (zones are admin-seeded directly per the Phase 5 report), so
   * there is no guaranteed MySQL-cuid → Firestore-doc-id mapping today.
   * Carried through as historical metadata only; the import script does
   * NOT attempt to resolve it to a real Firestore zone doc.
   */
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

interface OrderRow {
  orderNumber: string;
  userId: string;
  status: string;
  paymentStatus: string;
  shipContactName: string;
  shipContactPhone: string;
  shipLine1: string;
  shipLine2: string | null;
  shipLandmark: string | null;
  shipPincode: string;
  shipCity: string;
  shipState: string;
  subtotal: { toString(): string };
  discount: { toString(): string };
  taxTotal: { toString(): string };
  deliveryCharge: { toString(): string };
  total: { toString(): string };
  deliveryZoneId: string | null;
  etaMinMinutes: number | null;
  etaMaxMinutes: number | null;
  notes: string | null;
  placedAt: Date;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    variantId: string | null;
    productName: string;
    variantLabel: string;
    sku: string;
    imageUrl: string | null;
    unitPrice: { toString(): string };
    gstRate: { toString(): string };
    quantity: number;
    lineTotal: { toString(): string };
  }>;
  statusHistory: Array<{ status: string; note: string | null; createdAt: Date }>;
  payment: {
    method: string;
    status: string;
    amount: { toString(): string };
    currency: string;
    razorpayOrderId: string | null;
    razorpayPaymentId: string | null;
    razorpaySignature: string | null;
    refundId: string | null;
    refundedAmount: { toString(): string };
    paidAt: Date | null;
  } | null;
}

/** Pure — no Prisma call — unit-testable on its own. */
export function toExportedOrder(row: OrderRow, couponCode: string | null, rewardCouponCode: string | null): ExportedOrder {
  return {
    orderNumber: row.orderNumber,
    userId: row.userId,
    status: row.status,
    paymentStatus: row.paymentStatus,
    paymentMethod: row.payment?.method ?? 'COD',
    shipContactName: row.shipContactName,
    shipContactPhone: row.shipContactPhone,
    shipLine1: row.shipLine1,
    shipLine2: row.shipLine2,
    shipLandmark: row.shipLandmark,
    shipPincode: row.shipPincode,
    shipCity: row.shipCity,
    shipState: row.shipState,
    subtotal: row.subtotal.toString(),
    discount: row.discount.toString(),
    taxTotal: row.taxTotal.toString(),
    deliveryCharge: row.deliveryCharge.toString(),
    total: row.total.toString(),
    couponCode,
    rewardCouponCode,
    deliveryZoneId: row.deliveryZoneId,
    etaMinMinutes: row.etaMinMinutes,
    etaMaxMinutes: row.etaMaxMinutes,
    notes: row.notes,
    placedAt: row.placedAt.toISOString(),
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items: row.items.map((item) => ({
      variantId: item.variantId,
      productName: item.productName,
      variantLabel: item.variantLabel,
      sku: item.sku,
      imageUrl: item.imageUrl,
      unitPrice: item.unitPrice.toString(),
      gstRate: item.gstRate.toString(),
      quantity: item.quantity,
      lineTotal: item.lineTotal.toString(),
    })),
    statusHistory: row.statusHistory.map((h) => ({ status: h.status, note: h.note, createdAt: h.createdAt.toISOString() })),
    payment: row.payment
      ? {
          method: row.payment.method,
          status: row.payment.status,
          amount: row.payment.amount.toString(),
          currency: row.payment.currency,
          razorpayOrderId: row.payment.razorpayOrderId,
          razorpayPaymentId: row.payment.razorpayPaymentId,
          razorpaySignature: row.payment.razorpaySignature,
          refundId: row.payment.refundId,
          refundedAmount: row.payment.refundedAmount.toString(),
          paidAt: row.payment.paidAt ? row.payment.paidAt.toISOString() : null,
        }
      : null,
  };
}

async function main(): Promise<void> {
  const orders = await prisma.order.findMany({
    include: { items: true, statusHistory: { orderBy: { createdAt: 'asc' } }, payment: true, coupon: { select: { code: true } } },
    orderBy: { placedAt: 'asc' },
  });

  const redeemedRewards = await prisma.rewardCoupon.findMany({
    where: { redeemedOrderId: { not: null } },
    select: { code: true, redeemedOrderId: true },
  });
  const rewardCodeByOrderId = new Map(redeemedRewards.map((r) => [r.redeemedOrderId as string, r.code]));

  const exported = orders.map((o) =>
    toExportedOrder(o as unknown as OrderRow, o.coupon?.code ?? null, rewardCodeByOrderId.get(o.id) ?? null),
  );

  process.stdout.write(JSON.stringify({ orders: exported }, null, 2));
  process.stderr.write(`\nExported ${exported.length} order(s). MySQL was not modified (read-only).\n`);
}

main()
  .catch((err: unknown) => {
    console.error('Export failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
