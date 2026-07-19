import type { Timestamp } from 'firebase-admin/firestore';

/**
 * `coupons/{code}` — doc ID is the uppercased code (deterministic lookup,
 * matching Prisma `Coupon.code @unique`), per
 * docs/firebase-migration-audit.md §30. Global, store-wide only — the
 * source schema has no applicable-products/categories restriction
 * anywhere, confirmed by a full-repo grep of `coupons.service.ts` and the
 * Prisma schema, so none is invented here either.
 *
 * `value` is interpreted per `type`, exactly matching the Express
 * `Coupon.value` `Decimal` column's dual meaning: for `PERCENTAGE`, a
 * plain 0-100 percent; for `FLAT`, a paise amount (not rupees, to stay
 * consistent with this migration's integer-paise money convention
 * elsewhere).
 */
export type CouponType = 'PERCENTAGE' | 'FLAT';

export interface FirestoreCouponDoc {
  code: string;
  description: string | null;
  type: CouponType;
  value: number;
  minOrderPaise: number;
  maxDiscountPaise: number | null;
  /** null = unlimited (matches Prisma `usageLimit Int?`). */
  usageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  startsAt: Timestamp;
  expiresAt: Timestamp | null;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * `couponUsages/{usageId}` — auto-ID (a user may redeem the same coupon
 * more than once if `perUserLimit > 1`, so a deterministic
 * `{code}_{userId}` doc ID, as first sketched in audit §30, cannot express
 * more than one usage — order-creation instead queries
 * `where(couponCode, userId)` for a live count, matching the Express
 * `CouponRedemption` table's per-row-per-use semantics exactly).
 */
export interface FirestoreCouponUsageDoc {
  couponCode: string;
  userId: string;
  orderId: string;
  createdAt: Timestamp;
}

export interface CouponResponse extends Omit<FirestoreCouponDoc, 'startsAt' | 'expiresAt' | 'createdAt' | 'updatedAt'> {
  id: string;
  startsAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}
