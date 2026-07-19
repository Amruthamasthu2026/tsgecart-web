import type { Timestamp } from 'firebase-admin/firestore';

/**
 * `carts/{uid}/items/{sku}` — doc ID is the variant SKU (deterministic
 * upsert, matching `productVariants`' own doc-ID convention), per
 * docs/firebase-migration-audit.md §30. Deliberately no price/name
 * snapshot on the item doc — cart totals are always computed live,
 * server-side, from the current `productVariants` data, exactly matching
 * the existing Express `cartService.getCart` behavior (audit §9: "the
 * frontend never computes or trusts prices").
 */
export interface FirestoreCartItemDoc {
  variantId: string;
  quantity: number;
  addedAt: Timestamp;
  updatedAt: Timestamp;
}

/** A single priced/joined cart line, computed fresh on every read — never stored. */
export interface CartLineResponse {
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  image: string | null;
  unitLabel: string;
  sku: string;
  pricePaise: number;
  mrpPaise: number;
  gstRatePercent: number;
  quantity: number;
  lineTotalPaise: number;
  inStock: boolean;
  availableStock: number;
}

export interface CartResponse {
  items: CartLineResponse[];
  itemCount: number;
  subtotalPaise: number;
  taxPaise: number;
}
