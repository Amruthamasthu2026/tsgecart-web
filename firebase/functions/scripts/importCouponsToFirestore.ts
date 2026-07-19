/**
 * NOT EXECUTED AUTOMATICALLY. Imports global coupons and their per-user
 * usage records into Firestore from the JSON produced by
 * `backend/scripts/exportCouponsFromMysql.ts` (Firebase migration Phase 5).
 *
 * Safe by default: dry run unless `--execute` is passed. Idempotent: coupon
 * doc ID is the uppercased code (deterministic); usage doc ID is
 * `${couponCode}_${userId}_{index}` (deterministic per user per coupon),
 * so re-running with the same input never creates duplicate usage rows or
 * double-counts a coupon's `usedCount` (`usedCount` is written directly
 * from the export snapshot, not incremented).
 *
 * Usage:
 *   npx tsx scripts/importCouponsToFirestore.ts <path-to-export.json>              # dry run (default)
 *   npx tsx scripts/importCouponsToFirestore.ts <path-to-export.json> --execute    # real write
 */
import { readFileSync } from 'node:fs';
import { rupeesToPaise } from '../src/shared/money';
import { logger } from '../src/shared/logger';
import type { FirestoreCouponDoc, FirestoreCouponUsageDoc } from '../src/coupons/coupons.types';

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
  orderNumber: string | null;
  createdAt: string;
}

export type FirestoreCouponWrite = Omit<FirestoreCouponDoc, 'startsAt' | 'expiresAt' | 'createdAt' | 'updatedAt'> & {
  startsAt: string;
  expiresAt: string | null;
};

/** Pure — no Admin SDK, no file I/O — unit-testable on its own. */
export function toFirestoreCouponDoc(coupon: ExportedCoupon): FirestoreCouponWrite {
  return {
    code: coupon.code.toUpperCase(),
    description: coupon.description,
    type: coupon.type as 'PERCENTAGE' | 'FLAT',
    // PERCENTAGE keeps the plain 0-100 number; FLAT converts to paise —
    // matches FirestoreCouponDoc's dual-unit `value` field exactly.
    value: coupon.type === 'PERCENTAGE' ? Number(coupon.value) : rupeesToPaise(coupon.value),
    minOrderPaise: rupeesToPaise(coupon.minOrder),
    maxDiscountPaise: coupon.maxDiscount !== null ? rupeesToPaise(coupon.maxDiscount) : null,
    usageLimit: coupon.usageLimit,
    perUserLimit: coupon.perUserLimit,
    usedCount: coupon.usedCount,
    startsAt: coupon.startsAt,
    expiresAt: coupon.expiresAt,
    isActive: coupon.isActive,
  };
}

/** Pure. Doc ID: `${couponCode}_${userId}_{index}` — deterministic, idempotent on re-run. */
export function toFirestoreCouponUsageDoc(usage: ExportedCouponUsage): Omit<FirestoreCouponUsageDoc, 'createdAt'> & { createdAt: string } {
  return { couponCode: usage.couponCode.toUpperCase(), userId: usage.userId, orderId: usage.orderNumber ?? '', createdAt: usage.createdAt };
}

export interface ParsedArgs {
  filePath: string;
  execute: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const execute = argv.includes('--execute');
  const filePath = argv.find((a) => !a.startsWith('--'));
  if (!filePath) {
    throw new Error('Usage: importCouponsToFirestore.ts <path-to-export.json> [--execute]');
  }
  return { filePath, execute };
}

async function main(): Promise<void> {
  const { filePath, execute } = parseArgs(process.argv.slice(2));
  const raw = readFileSync(filePath, 'utf8');
  const { coupons, usages } = JSON.parse(raw) as { coupons: ExportedCoupon[]; usages: ExportedCouponUsage[] };

  logger.info('Loaded coupon import records', { coupons: coupons.length, usages: usages.length });
  console.log(`Loaded ${coupons.length} coupon(s) and ${usages.length} usage record(s) from ${filePath}.`);
  if (coupons[0]) {
    console.log('Sample coupon:', toFirestoreCouponDoc(coupons[0]));
  }

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

  for (const coupon of coupons) {
    const couponDoc = toFirestoreCouponDoc(coupon);
    const now = FieldValue.serverTimestamp();
    batch.set(db.collection('coupons').doc(couponDoc.code), {
      ...couponDoc,
      startsAt: Timestamp.fromDate(new Date(couponDoc.startsAt)),
      expiresAt: couponDoc.expiresAt ? Timestamp.fromDate(new Date(couponDoc.expiresAt)) : null,
      createdAt: now,
      updatedAt: now,
    });
    opsInBatch += 1;
    await commitIfFull();
  }

  const usagesByCouponUser = new Map<string, number>();
  for (const usage of usages) {
    const usageDoc = toFirestoreCouponUsageDoc(usage);
    const key = `${usageDoc.couponCode}_${usageDoc.userId}`;
    const index = usagesByCouponUser.get(key) ?? 0;
    usagesByCouponUser.set(key, index + 1);
    batch.set(db.collection('couponUsages').doc(`${key}_${index}`), {
      ...usageDoc,
      createdAt: Timestamp.fromDate(new Date(usageDoc.createdAt)),
    });
    opsInBatch += 1;
    await commitIfFull();
  }
  if (opsInBatch > 0) {
    await batch.commit();
  }

  logger.info('Firestore coupon import complete', { coupons: coupons.length, usages: usages.length });
  console.log(`Wrote ${coupons.length} coupon(s) and ${usages.length} usage record(s).`);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('Import failed:', err);
    process.exitCode = 1;
  });
}
