import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import type {
  FirestoreCategoryDoc,
  FirestoreProductDoc,
  CategoryResponse,
  ProductResponse,
} from './catalog.types';

export type ProductSortField = 'createdAt' | 'name' | 'ratingAvg' | 'price';
export type FirestoreOrderableField = 'createdAt' | 'name' | 'ratingAvg' | 'minPricePaise';

const SORT_FIELD_MAP: Record<ProductSortField, FirestoreOrderableField> = {
  createdAt: 'createdAt',
  name: 'name',
  ratingAvg: 'ratingAvg',
  // Firestore has no per-variant join, so "price" sorts by the denormalized
  // minPricePaise snapshot. This is a deliberate improvement over the
  // existing Express API, whose `sort=price` silently falls back to
  // createdAt (see backend/src/modules/products/products.service.ts) —
  // Firestore's product doc always carries a real, sortable price field.
  price: 'minPricePaise',
};

export interface GetProductsInput {
  categorySlug?: string;
  featured?: boolean;
  bestSeller?: boolean;
  search?: string;
  sort: ProductSortField;
  order: 'asc' | 'desc';
  page: number;
  limit: number;
}

export interface ProductsQueryPlan {
  categorySlug?: string;
  featured?: boolean;
  bestSeller?: boolean;
  orderByField: FirestoreOrderableField;
  orderByDirection: 'asc' | 'desc';
  offset: number;
  limit: number;
  /**
   * Best-effort prefix search on `name` (Firestore has no native
   * full-text/`contains` search). When set, results are ordered by `name`
   * regardless of the requested sort — a documented limitation, not a bug.
   */
  namePrefix?: string;
}

/** Pure — translates validated input into a declarative query plan, unit-testable without Firestore. */
export function buildProductsQueryPlan(input: GetProductsInput): ProductsQueryPlan {
  return {
    categorySlug: input.categorySlug,
    featured: input.featured,
    bestSeller: input.bestSeller,
    orderByField: SORT_FIELD_MAP[input.sort],
    orderByDirection: input.order,
    offset: (input.page - 1) * input.limit,
    limit: input.limit,
    namePrefix: input.search,
  };
}

/**
 * Trending Deals selection priority, replicating (server-side, as a single
 * reusable Function) the fallback chain the frontend's HomePage already
 * implements client-side: bestSeller → featured → newest. There is no
 * `isTrending` field anywhere in the data model — this fallback IS "trending"
 * (see docs/firebase-migration-audit.md addendum for Phase 3).
 */
export function pickTrendingList<T>(bestSellers: T[], featured: T[], latest: T[]): T[] {
  if (bestSellers.length > 0) return bestSellers;
  if (featured.length > 0) return featured;
  return latest;
}

function timestampToIso(value: FirestoreCategoryDoc['createdAt']): string {
  return value.toDate().toISOString();
}

export function categoryDocToResponse(
  doc: QueryDocumentSnapshot<FirestoreCategoryDoc>,
): CategoryResponse {
  const data = doc.data();
  return {
    ...data,
    id: doc.id,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

export function productDocToResponse(doc: QueryDocumentSnapshot<FirestoreProductDoc>): ProductResponse {
  const data = doc.data();
  return {
    ...data,
    id: doc.id,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}
