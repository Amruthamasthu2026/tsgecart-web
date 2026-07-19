import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from '../lib/firebase';
import type {
  Product,
  ProductDetail,
  ProductVariant,
  Category,
  Pagination,
} from '../features/catalog/catalog.types';

/**
 * Firestore-backed catalog service — added ALONGSIDE
 * `features/catalog/catalog.api.ts` (the existing Express-backed client),
 * which is untouched. Calls the read-only Callable Functions in
 * `firebase/functions/src/catalog/` (getProducts, getProductBySlug,
 * getCategories, getFeaturedProducts, getTrendingProducts).
 *
 * See `VITE_USE_FIRESTORE_PRODUCTS` (frontend/.env.example) — the pages
 * that consume this service only do so when that flag is `"true"`;
 * otherwise they keep using `catalogApi` exactly as before.
 */

export interface FirestoreDefaultVariant {
  sku: string;
  unitLabel: string;
  mrpPaise: number;
  pricePaise: number;
  stock: number;
}

export interface FirestoreProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

/** A real `productVariants/{sku}` document (Phase 4) — see `getProductVariants` below. */
export interface FirestoreVariant {
  id: string;
  productId: string;
  unitLabel: string;
  mrpPaise: number;
  pricePaise: number;
  weightGrams: number | null;
  isActive: boolean;
  isDefault: boolean;
  availableStock: number;
  createdAt: string;
  updatedAt: string;
}

export interface FirestorePagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface FirestoreProductFilters {
  categorySlug?: string;
  featured?: boolean;
  bestSeller?: boolean;
  search?: string;
  sort?: 'createdAt' | 'name' | 'ratingAvg' | 'price';
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

const getProductsCallable = httpsCallable<
  FirestoreProductFilters,
  { products: FirestoreProduct[]; meta: FirestorePagination }
>(firebaseFunctions, 'getProducts');
const getProductBySlugCallable = httpsCallable<{ slug: string }, FirestoreProduct>(
  firebaseFunctions,
  'getProductBySlug',
);
const getCategoriesCallable = httpsCallable<undefined, { categories: FirestoreCategory[] }>(
  firebaseFunctions,
  'getCategories',
);
const getFeaturedProductsCallable = httpsCallable<{ limit?: number }, { products: FirestoreProduct[] }>(
  firebaseFunctions,
  'getFeaturedProducts',
);
const getTrendingProductsCallable = httpsCallable<{ limit?: number }, { products: FirestoreProduct[] }>(
  firebaseFunctions,
  'getTrendingProducts',
);
const getProductVariantsCallable = httpsCallable<{ productId: string }, { variants: FirestoreVariant[] }>(
  firebaseFunctions,
  'getProductVariants',
);

export const firebaseProductsApi = {
  async getProducts(
    filters: FirestoreProductFilters = {},
  ): Promise<{ products: FirestoreProduct[]; meta: FirestorePagination }> {
    const result = await getProductsCallable(filters);
    return result.data;
  },

  async getProduct(slug: string): Promise<FirestoreProduct> {
    const result = await getProductBySlugCallable({ slug });
    return result.data;
  },

  async getCategories(): Promise<FirestoreCategory[]> {
    const result = await getCategoriesCallable();
    return result.data.categories;
  },

  async getFeaturedProducts(limit = 12): Promise<FirestoreProduct[]> {
    const result = await getFeaturedProductsCallable({ limit });
    return result.data.products;
  },

  async getTrendingProducts(limit = 8): Promise<FirestoreProduct[]> {
    const result = await getTrendingProductsCallable({ limit });
    return result.data.products;
  },

  /** Every active variant of a product (Phase 4), for the product-detail page's real variant selector. */
  async getProductVariants(productId: string): Promise<FirestoreVariant[]> {
    const result = await getProductVariantsCallable({ productId });
    return result.data.variants;
  },
};

/** True when the Firestore-backed catalog surface should be used instead of the Express API. */
export const useFirestoreProducts = import.meta.env.VITE_USE_FIRESTORE_PRODUCTS === 'true';

function paiseToRupeeString(paise: number): string {
  return (paise / 100).toFixed(2);
}

/**
 * Reshapes a Firestore product into the exact `Product` type
 * `ProductCard`/`HomePage`/`ProductsPage` already render — so switching the
 * data source (via `useFirestoreProducts`) needs no changes to any
 * rendering code. Phase 3 has no `productVariants` collection (see
 * docs/firebase-migration-audit.md §34), so this always synthesizes a
 * single variant from the denormalized `defaultVariant` snapshot rather
 * than a real multi-variant list.
 */
export function toLegacyProduct(fsProduct: FirestoreProduct): Product {
  return {
    id: fsProduct.id,
    name: fsProduct.name,
    slug: fsProduct.slug,
    description: fsProduct.description,
    images: fsProduct.images,
    gstRate: String(fsProduct.gstRatePercent),
    ratingAvg: String(fsProduct.ratingAvg),
    ratingCount: fsProduct.ratingCount,
    isFeatured: fsProduct.isFeatured,
    isBestSeller: fsProduct.isBestSeller,
    metaTitle: fsProduct.metaTitle,
    metaDescription: fsProduct.metaDescription,
    category: { id: fsProduct.categoryId, name: fsProduct.categoryName, slug: fsProduct.categoryId },
    brand: fsProduct.brandId ? { id: fsProduct.brandId, name: fsProduct.brandName ?? '', slug: fsProduct.brandId } : null,
    variants: fsProduct.defaultVariant
      ? [
          {
            id: fsProduct.defaultVariant.sku,
            sku: fsProduct.defaultVariant.sku,
            unitLabel: fsProduct.defaultVariant.unitLabel,
            mrp: paiseToRupeeString(fsProduct.defaultVariant.mrpPaise),
            price: paiseToRupeeString(fsProduct.defaultVariant.pricePaise),
            isDefault: true,
            isActive: true,
            inventory: { stock: fsProduct.defaultVariant.stock, reserved: 0 },
          },
        ]
      : [],
  };
}

/**
 * Reshapes real `productVariants` docs (Phase 4) into the legacy
 * `ProductVariant[]` shape — a faithful multi-variant list, unlike
 * `toLegacyProduct`'s single synthesized variant from the `defaultVariant`
 * snapshot. `inventory.reserved` is always reported as 0: Firestore never
 * exposes the raw reserved count to a public client (see
 * inventory/inventory.types.ts) — `availableStock` (net of reservations
 * already) is the only stock figure the client ever sees, matching
 * `stock - reserved` closely enough for display purposes.
 */
export function toLegacyVariants(fsVariants: FirestoreVariant[]): ProductVariant[] {
  return fsVariants.map((v) => ({
    id: v.id,
    sku: v.id,
    unitLabel: v.unitLabel,
    mrp: paiseToRupeeString(v.mrpPaise),
    price: paiseToRupeeString(v.pricePaise),
    isDefault: v.isDefault,
    isActive: v.isActive,
    inventory: { stock: v.availableStock, reserved: 0 },
  }));
}

/**
 * Same reshaping as `toLegacyProduct`, plus an empty `reviews` array —
 * there is still no `reviews` collection (Phase 3/4 didn't add one). Pass
 * `realVariants` (from `getProductVariants`, Phase 4) to replace the
 * single synthesized `defaultVariant` guess with the true variant list;
 * omit it to keep the Phase 3 single-variant behavior.
 */
export function toLegacyProductDetail(fsProduct: FirestoreProduct, realVariants?: FirestoreVariant[]): ProductDetail {
  const base = toLegacyProduct(fsProduct);
  return {
    ...base,
    variants: realVariants && realVariants.length > 0 ? toLegacyVariants(realVariants) : base.variants,
    reviews: [],
  };
}

export function toLegacyCategory(fsCategory: FirestoreCategory): Category {
  return {
    id: fsCategory.id,
    name: fsCategory.name,
    slug: fsCategory.slug,
    imageUrl: fsCategory.imageUrl,
    isActive: fsCategory.isActive,
    _count: { products: fsCategory.productCount },
  };
}

export function toLegacyPagination(fsPagination: FirestorePagination): Pagination {
  return { ...fsPagination };
}
