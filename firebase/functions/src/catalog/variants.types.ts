import type { Timestamp } from 'firebase-admin/firestore';

/**
 * `productVariants/{sku}` — doc ID is the SKU (unique by business rule
 * already, per docs/firebase-migration-audit.md §30), completing the
 * deferral recorded in catalog.types.ts / audit §34: Phase 3 shipped only
 * a denormalized `defaultVariant` snapshot on `products/{slug}`; Phase 4
 * adds the real collection this was always meant to become.
 *
 * `availableStock` here is a DENORMALIZED, PUBLIC-SAFE copy of
 * `stock - reserved` from `inventory/{sku}` (which stays STAFF/ADMIN +
 * Function-only — see inventory/inventory.types.ts). It is recomputed by
 * every inventory-adjusting Function in the same transaction that touches
 * `inventory/{sku}`, never written directly by a client. This mirrors
 * audit §30's explicit recommendation: "recommend exposing a computed
 * availableStock field rather than raw stock/reserved."
 */
export interface FirestoreVariantDoc {
  productId: string;
  unitLabel: string;
  mrpPaise: number;
  pricePaise: number;
  // No gstRatePercent here on purpose: GST is a per-PRODUCT rate in the
  // source schema (Prisma `Product.gstRate` — there is no `gstRate` column
  // on `ProductVariant`), so it's read from the parent `products/{slug}`
  // doc, not duplicated per-variant (see cart/cart.function.ts's fetchCart,
  // which joins to the product doc precisely for this field).
  weightGrams: number | null;
  isActive: boolean;
  isDefault: boolean;
  availableStock: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface VariantResponse extends Omit<FirestoreVariantDoc, 'createdAt' | 'updatedAt'> {
  id: string;
  createdAt: string;
  updatedAt: string;
}
