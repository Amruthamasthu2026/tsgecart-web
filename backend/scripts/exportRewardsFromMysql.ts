/**
 * READ-ONLY MySQL → Firestore import-ready JSON export for the reward-spin
 * system (Firebase migration Phase 5). Exports BOTH reward systems the
 * Phase 0 audit identified (docs/firebase-migration-audit.md §12):
 *
 * - `RewardConfig`/`RewardCoupon` ("System B", coupon-issuing) — the
 *   canonical model this migration ports to Firestore. See
 *   firebase/functions/src/rewards/rewards.types.ts for the full rationale.
 * - `SpinHistory` (legacy "System A", wallet-credit wheel) — exported here
 *   for completeness/no-data-left-behind ONLY. It is NOT imported into
 *   Firestore by importRewardsToFirestore.ts; System A has no Firestore
 *   equivalent in this migration.
 *
 * Read-only — never writes to MySQL, never calls Firebase, not wired into
 * any automatic npm lifecycle script.
 *
 * Usage (NOT executed as part of this migration phase):
 *   npm run --workspace backend export:firebase-rewards > backend/scripts/output/rewards-export.json
 *
 * Output feeds firebase/functions/scripts/importRewardsToFirestore.ts.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ExportedRewardConfig {
  id: string;
  cashbackAmount: string;
  probability: number;
  minOrder: string;
  expiryDays: number;
  isActive: boolean;
  sortOrder: number;
}

export interface ExportedRewardCoupon {
  code: string;
  userId: string;
  cashbackAmount: string;
  minOrder: string;
  status: string;
  expiresAt: string;
  redeemedOrderNumber: string | null;
  redeemedAt: string | null;
  createdAt: string;
}

export interface ExportedLegacySpinHistory {
  userId: string;
  segmentLabel: string;
  rewardAmount: string;
  createdAt: string;
}

interface RewardConfigRow {
  id: string;
  cashbackAmount: { toString(): string };
  probability: number;
  minOrder: { toString(): string };
  expiryDays: number;
  isActive: boolean;
  sortOrder: number;
}

interface RewardCouponRow {
  code: string;
  userId: string;
  cashbackAmount: { toString(): string };
  minOrder: { toString(): string };
  status: string;
  expiresAt: Date;
  redeemedOrderNumber: string | null;
  redeemedAt: Date | null;
  createdAt: Date;
}

interface SpinHistoryRow {
  userId: string;
  segmentLabel: string;
  rewardAmount: { toString(): string };
  createdAt: Date;
}

/** Pure — no Prisma call — unit-testable on its own. */
export function toExportedRewardConfig(row: RewardConfigRow): ExportedRewardConfig {
  return {
    id: row.id,
    cashbackAmount: row.cashbackAmount.toString(),
    probability: row.probability,
    minOrder: row.minOrder.toString(),
    expiryDays: row.expiryDays,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

/** Pure — no Prisma call — unit-testable on its own. */
export function toExportedRewardCoupon(row: RewardCouponRow): ExportedRewardCoupon {
  return {
    code: row.code,
    userId: row.userId,
    cashbackAmount: row.cashbackAmount.toString(),
    minOrder: row.minOrder.toString(),
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    redeemedOrderNumber: row.redeemedOrderNumber,
    redeemedAt: row.redeemedAt ? row.redeemedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Pure — no Prisma call — unit-testable on its own. */
export function toExportedLegacySpinHistory(row: SpinHistoryRow): ExportedLegacySpinHistory {
  return { userId: row.userId, segmentLabel: row.segmentLabel, rewardAmount: row.rewardAmount.toString(), createdAt: row.createdAt.toISOString() };
}

async function main(): Promise<void> {
  const [configs, coupons, spins] = await Promise.all([
    prisma.rewardConfig.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.rewardCoupon.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.spinHistory.findMany({ include: { segment: { select: { label: true } } }, orderBy: { createdAt: 'asc' } }),
  ]);

  // RewardCoupon.redeemedOrderId is a raw MySQL Order.id (cuid) — resolve to
  // the portable orderNumber the same way exportOrdersFromMysql.ts does.
  const orderIds = coupons.map((c) => c.redeemedOrderId).filter((id): id is string => Boolean(id));
  const orders = orderIds.length ? await prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNumber: true } }) : [];
  const orderNumberById = new Map(orders.map((o) => [o.id, o.orderNumber]));

  const exportedConfigs = configs.map((c) => toExportedRewardConfig(c as unknown as RewardConfigRow));
  const exportedCoupons = coupons.map((c) =>
    toExportedRewardCoupon({
      ...(c as unknown as RewardCouponRow),
      redeemedOrderNumber: c.redeemedOrderId ? orderNumberById.get(c.redeemedOrderId) ?? null : null,
    }),
  );
  const exportedSpins = spins.map((s) => toExportedLegacySpinHistory({ ...(s as unknown as SpinHistoryRow), segmentLabel: s.segment.label }));

  process.stdout.write(JSON.stringify({ rewardConfigs: exportedConfigs, rewardCoupons: exportedCoupons, legacySpinHistory: exportedSpins }, null, 2));
  process.stderr.write(
    `\nExported ${exportedConfigs.length} reward config(s), ${exportedCoupons.length} reward coupon(s), ${exportedSpins.length} legacy spin record(s) (not imported). MySQL was not modified (read-only).\n`,
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
