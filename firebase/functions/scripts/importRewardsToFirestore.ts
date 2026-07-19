/**
 * NOT EXECUTED AUTOMATICALLY. Imports reward-spin tiers and issued reward
 * coupons into Firestore from the JSON produced by
 * `backend/scripts/exportRewardsFromMysql.ts` (Firebase migration Phase 5).
 *
 * Only "System B" (RewardConfig/RewardCoupon) is imported — the legacy
 * `legacySpinHistory` field in the export JSON is deliberately IGNORED by
 * this script; System A has no Firestore equivalent in this migration (see
 * firebase/functions/src/rewards/rewards.types.ts for the full rationale).
 *
 * Safe by default: dry run unless `--execute` is passed. Idempotent:
 * rewardConfig doc ID is the original MySQL `RewardConfig.id` (reused
 * as-is, stable across re-runs); rewardCoupon doc ID is the code itself
 * (already globally unique). Every write is a deterministic `set()`.
 *
 * Usage:
 *   npx tsx scripts/importRewardsToFirestore.ts <path-to-export.json>              # dry run (default)
 *   npx tsx scripts/importRewardsToFirestore.ts <path-to-export.json> --execute    # real write
 */
import { readFileSync } from 'node:fs';
import { rupeesToPaise } from '../src/shared/money';
import { logger } from '../src/shared/logger';
import type { FirestoreRewardConfigDoc, FirestoreRewardCouponDoc } from '../src/rewards/rewards.types';

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

export type FirestoreRewardConfigWrite = Omit<FirestoreRewardConfigDoc, 'createdAt' | 'updatedAt'>;
export type FirestoreRewardCouponWrite = Omit<FirestoreRewardCouponDoc, 'expiresAt' | 'redeemedAt' | 'createdAt'> & {
  expiresAt: string;
  redeemedAt: string | null;
  createdAt: string;
};

/** Pure — no Admin SDK, no file I/O — unit-testable on its own. */
export function toFirestoreRewardConfigDoc(config: ExportedRewardConfig): FirestoreRewardConfigWrite {
  return {
    cashbackAmountPaise: rupeesToPaise(config.cashbackAmount),
    probability: config.probability,
    minOrderPaise: rupeesToPaise(config.minOrder),
    expiryDays: config.expiryDays,
    isActive: config.isActive,
    sortOrder: config.sortOrder,
  };
}

/** Pure — no Admin SDK, no file I/O — unit-testable on its own. */
export function toFirestoreRewardCouponDoc(coupon: ExportedRewardCoupon): FirestoreRewardCouponWrite {
  return {
    code: coupon.code,
    userId: coupon.userId,
    cashbackAmountPaise: rupeesToPaise(coupon.cashbackAmount),
    minOrderPaise: rupeesToPaise(coupon.minOrder),
    status: coupon.status as 'ACTIVE' | 'REDEEMED' | 'EXPIRED',
    expiresAt: coupon.expiresAt,
    redeemedOrderId: coupon.redeemedOrderNumber,
    redeemedAt: coupon.redeemedAt,
    createdAt: coupon.createdAt,
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
    throw new Error('Usage: importRewardsToFirestore.ts <path-to-export.json> [--execute]');
  }
  return { filePath, execute };
}

async function main(): Promise<void> {
  const { filePath, execute } = parseArgs(process.argv.slice(2));
  const raw = readFileSync(filePath, 'utf8');
  const { rewardConfigs, rewardCoupons } = JSON.parse(raw) as {
    rewardConfigs: ExportedRewardConfig[];
    rewardCoupons: ExportedRewardCoupon[];
    legacySpinHistory?: unknown[];
  };

  logger.info('Loaded reward import records', { configs: rewardConfigs.length, coupons: rewardCoupons.length });
  console.log(`Loaded ${rewardConfigs.length} reward config(s) and ${rewardCoupons.length} reward coupon(s) from ${filePath}.`);
  console.log('(legacySpinHistory, if present in the export, is intentionally NOT imported — see file header.)');

  if (!execute) {
    console.log('\nDRY RUN — nothing was written to Firestore. Re-run with --execute to perform the real import.');
    return;
  }

  const { db } = await import('../src/config/firebaseAdmin');
  const { Timestamp, FieldValue } = await import('firebase-admin/firestore');

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

  for (const config of rewardConfigs) {
    const configDoc = toFirestoreRewardConfigDoc(config);
    const now = FieldValue.serverTimestamp();
    batch.set(db.collection('rewardConfigs').doc(config.id), { ...configDoc, createdAt: now, updatedAt: now });
    opsInBatch += 1;
    await commitIfFull();
  }

  for (const coupon of rewardCoupons) {
    const couponDoc = toFirestoreRewardCouponDoc(coupon);
    batch.set(db.collection('rewardCoupons').doc(couponDoc.code), {
      ...couponDoc,
      expiresAt: Timestamp.fromDate(new Date(couponDoc.expiresAt)),
      redeemedAt: couponDoc.redeemedAt ? Timestamp.fromDate(new Date(couponDoc.redeemedAt)) : null,
      createdAt: Timestamp.fromDate(new Date(couponDoc.createdAt)),
    });
    opsInBatch += 1;
    await commitIfFull();
  }
  if (opsInBatch > 0) {
    await batch.commit();
  }

  logger.info('Firestore reward import complete', { configs: rewardConfigs.length, coupons: rewardCoupons.length });
  console.log(`Wrote ${rewardConfigs.length} reward config(s) and ${rewardCoupons.length} reward coupon(s).`);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('Import failed:', err);
    process.exitCode = 1;
  });
}
