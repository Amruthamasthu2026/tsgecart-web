/**
 * READ-ONLY MySQL → Firestore import-ready JSON export for global coupons
 * and their per-user redemption records (Firebase migration Phase 5).
 * Read-only — never writes to MySQL, never calls Firebase, not wired into
 * any automatic npm lifecycle script.
 *
 * Usage (NOT executed as part of this migration phase):
 *   npm run --workspace backend export:firebase-coupons > backend/scripts/output/coupons-export.json
 *
 * Output feeds firebase/functions/scripts/importCouponsToFirestore.ts.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ExportedCoupon {
  code: string;
  description: string | null;
  type: string;
  value: string;
  minOrder: string;
  maxDiscount: string | null;
  usageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  startsAt: string;
  expiresAt: string | null;
  isActive: boolean;
}

export interface ExportedCouponUsage {
  couponCode: string;
  userId: string;
  /** The order's public order number (portable across MySQL/Firestore), not the MySQL order cuid. */
  orderNumber: string | null;
  createdAt: string;
}

interface CouponRow {
  code: string;
  description: string | null;
  type: string;
  value: { toString(): string };
  minOrder: { toString(): string };
  maxDiscount: { toString(): string } | null;
  usageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  startsAt: Date;
  expiresAt: Date | null;
  isActive: boolean;
}

interface RedemptionRow {
  couponCode: string;
  userId: string;
  orderNumber: string | null;
  createdAt: Date;
}

/** Pure — no Prisma call — unit-testable on its own. */
export function toExportedCoupon(row: CouponRow): ExportedCoupon {
  return {
    code: row.code,
    description: row.description,
    type: row.type,
    value: row.value.toString(),
    minOrder: row.minOrder.toString(),
    maxDiscount: row.maxDiscount ? row.maxDiscount.toString() : null,
    usageLimit: row.usageLimit,
    perUserLimit: row.perUserLimit,
    usedCount: row.usedCount,
    startsAt: row.startsAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    isActive: row.isActive,
  };
}

/** Pure — no Prisma call — unit-testable on its own. */
export function toExportedCouponUsage(row: RedemptionRow): ExportedCouponUsage {
  return { couponCode: row.couponCode, userId: row.userId, orderNumber: row.orderNumber, createdAt: row.createdAt.toISOString() };
}

async function main(): Promise<void> {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'asc' } });
  const redemptions = await prisma.couponRedemption.findMany({
  include: {
    coupon: {
      select: {
        code: true,
      },
    },
  },
  orderBy: {
    createdAt: 'asc',
  },
});

const redemptionOrderIds = redemptions
  .map((redemption) => redemption.orderId)
  .filter((orderId): orderId is string => orderId !== null);

const redemptionOrders =
  redemptionOrderIds.length > 0
    ? await prisma.order.findMany({
        where: {
          id: {
            in: redemptionOrderIds,
          },
        },
        select: {
          id: true,
          orderNumber: true,
        },
      })
    : [];

const orderNumberById = new Map(
  redemptionOrders.map((order) => [order.id, order.orderNumber]),
);

const exportedCoupons = coupons.map((coupon) =>
  toExportedCoupon(coupon as unknown as CouponRow),
);

const exportedUsages = redemptions.map((redemption) =>
  toExportedCouponUsage({
    couponCode: redemption.coupon.code,
    userId: redemption.userId,
    orderNumber: redemption.orderId
      ? orderNumberById.get(redemption.orderId) ?? null
      : null,
    createdAt: redemption.createdAt,
  }),
);

  process.stdout.write(JSON.stringify({ coupons: exportedCoupons, usages: exportedUsages }, null, 2));
  process.stderr.write(
    `\nExported ${exportedCoupons.length} coupon(s) and ${exportedUsages.length} usage record(s). MySQL was not modified (read-only).\n`,
  );
}

main()
  .catch((err: unknown) => {
    console.error('Export failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
