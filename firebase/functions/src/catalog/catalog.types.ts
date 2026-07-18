import type { Timestamp } from 'firebase-admin/firestore';

/**
 * Firestore document shapes for `categories/{slug}` and `products/{slug}`,
 * per docs/firebase-migration-audit.md §30. Doc ID is the slug in both
 * collections (documented rationale: "avoids a separate slug-lookup
 * query").
 *
 * Deviation from §30, recorded here and in the audit addendum: variants are
 * NOT migrated to their own `productVariants` collection in this phase.
 * Phase 3 only covers browsing (product/category listing + detail), which
 * this repo's frontend renders from a single "default variant" price/stock
 * snapshot (see `ProductCard`/`HomePage`) — a full per-variant selector and
 * cart integration are explicitly out of scope for this phase (see the
 * migration instructions: "Do not continue to Cart... yet"). `products`
 * therefore carries a denormalized `defaultVariant` snapshot plus
 * `minPricePaise`/`maxPricePaise` for sorting/filtering, instead of a
 * `productVariants` join. The full variants collection remains real,
 * separate future work — see the Phase 3 completion report.
 */

export interface FirestoreCategoryDoc {
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  /** Denormalized count of active products in this category (audit §30). */
  productCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FirestoreDefaultVariant {
  sku: string;
  unitLabel: string;
  mrpPaise: number;
  pricePaise: number;
  stock: number;
}

export interface FirestoreProductDoc {
  name: string;
  slug: string;
  description: string | null;
  categoryId: string;
  /** Denormalized so listings never need a join back to `categories`. */
  categoryName: string;
  brandId: string | null;
  brandName: string | null;
  images: string[];
  gstRatePercent: number;
  hsnCode: string | null;
  isActive: boolean;
  isFeatured: boolean;
  isBestSeller: boolean;
  ratingAvg: number;
  ratingCount: number;
  metaTitle: string | null;
  metaDescription: string | null;
  minPricePaise: number;
  maxPricePaise: number;
  defaultVariant: FirestoreDefaultVariant | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** JSON-safe response shapes (Timestamps converted to ISO strings). */
export interface CategoryResponse extends Omit<FirestoreCategoryDoc, 'createdAt' | 'updatedAt'> {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductResponse extends Omit<FirestoreProductDoc, 'createdAt' | 'updatedAt'> {
  id: string;
  createdAt: string;
  updatedAt: string;
}
