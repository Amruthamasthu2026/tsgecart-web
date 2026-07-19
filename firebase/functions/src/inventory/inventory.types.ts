import type { Timestamp } from 'firebase-admin/firestore';

/**
 * `inventory/{sku}` — doc ID matches the owning `productVariants/{sku}`
 * doc (1:1, deterministic — no separate lookup), per
 * docs/firebase-migration-audit.md §30.
 *
 * NEVER directly writable by any client, including an admin's browser —
 * always via a Function, because every write is either transactional
 * (reservation, order flow) or needs the `isLowStock` recompute. This is
 * the audit's own explicit instruction, unlike `products`/`categories`/
 * `productVariants`, which STAFF/ADMIN may write directly via Security
 * Rules.
 */
export interface FirestoreInventoryDoc {
  stock: number;
  reserved: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  updatedAt: Timestamp;
}
