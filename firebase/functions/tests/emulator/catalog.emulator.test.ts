import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../src/config/firebaseAdmin';
import type { GetProductsResult } from '../../src/catalog/products.function';
import type { ProductResponse, CategoryResponse } from '../../src/catalog/catalog.types';

/**
 * Real Firestore + Functions emulator integration tests for the Phase 3
 * catalog Callable Functions (migration "STEP 8": anonymous product reads,
 * slug lookup, featured query, category query — "admin product writes" /
 * "non-admin write denial" are covered at the Security Rules layer in
 * tests/firestore.rules.test.ts, since there is no product-write Callable
 * Function — writes go straight through the client SDK, governed by
 * firestore.rules, per the migration's STEP 7).
 *
 * Run via `npm run test:emulator` (wraps this file in `firebase
 * emulators:exec --only auth,firestore,functions`, after a build).
 */

const PROJECT_ID = 'demo-tsgecart';
const FUNCTIONS_EMULATOR_HOST = '127.0.0.1';
const FUNCTIONS_EMULATOR_PORT = 5001;

let app: FirebaseApp;
let functions: Functions;

const CATEGORY_DRY_FRUITS = {
  name: 'Dry Fruits',
  slug: 'dry-fruits',
  description: null,
  imageUrl: null,
  parentId: null,
  sortOrder: 1,
  isActive: true,
  productCount: 2,
};
const CATEGORY_DAIRY = {
  name: 'Dairy',
  slug: 'dairy',
  description: null,
  imageUrl: null,
  parentId: null,
  sortOrder: 2,
  isActive: true,
  productCount: 0,
};
const CATEGORY_INACTIVE = {
  name: 'Old Seasonal',
  slug: 'old-seasonal',
  description: null,
  imageUrl: null,
  parentId: null,
  sortOrder: 3,
  isActive: false,
  productCount: 0,
};

function seedProduct(overrides: Record<string, unknown>) {
  return {
    description: null,
    categoryId: 'dry-fruits',
    categoryName: 'Dry Fruits',
    brandId: null,
    brandName: null,
    images: [],
    gstRatePercent: 5,
    hsnCode: null,
    isActive: true,
    isFeatured: false,
    isBestSeller: false,
    ratingAvg: 4,
    ratingCount: 10,
    metaTitle: null,
    metaDescription: null,
    minPricePaise: 10000,
    maxPricePaise: 10000,
    defaultVariant: { sku: 'SKU-DEFAULT', unitLabel: '500 g', mrpPaise: 12000, pricePaise: 10000, stock: 25 },
    ...overrides,
  };
}

beforeAll(async () => {
  app = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-api-key-for-emulator' });
  functions = getFunctions(app);
  connectFunctionsEmulator(functions, FUNCTIONS_EMULATOR_HOST, FUNCTIONS_EMULATOR_PORT);

  const now = FieldValue.serverTimestamp();
  await Promise.all([
    db.doc('categories/dry-fruits').set({ ...CATEGORY_DRY_FRUITS, createdAt: now, updatedAt: now }),
    db.doc('categories/dairy').set({ ...CATEGORY_DAIRY, createdAt: now, updatedAt: now }),
    db.doc('categories/old-seasonal').set({ ...CATEGORY_INACTIVE, createdAt: now, updatedAt: now }),
  ]);

  await Promise.all([
    db.doc('products/fresh-almonds').set({
      ...seedProduct({ name: 'Fresh Almonds', slug: 'fresh-almonds', isFeatured: true }),
      createdAt: now,
      updatedAt: now,
    }),
    db.doc('products/cashew-nuts').set({
      ...seedProduct({ name: 'Cashew Nuts', slug: 'cashew-nuts', isBestSeller: true, minPricePaise: 20000, maxPricePaise: 20000 }),
      createdAt: now,
      updatedAt: now,
    }),
    db.doc('products/walnut-halves').set({
      ...seedProduct({ name: 'Walnut Halves', slug: 'walnut-halves', minPricePaise: 15000, maxPricePaise: 15000 }),
      createdAt: now,
      updatedAt: now,
    }),
    db.doc('products/discontinued-raisins').set({
      ...seedProduct({ name: 'Discontinued Raisins', slug: 'discontinued-raisins', isActive: false }),
      createdAt: now,
      updatedAt: now,
    }),
  ]);
});

afterAll(async () => {
  await deleteApp(app);
});

describe('getCategories — anonymous, no auth required', () => {
  it('returns only active categories, ordered by sortOrder then name', async () => {
    const getCategories = httpsCallable<undefined, { categories: CategoryResponse[] }>(functions, 'getCategories');
    const result = await getCategories();
    const slugs = result.data.categories.map((c) => c.slug);
    expect(slugs).toEqual(['dry-fruits', 'dairy']);
    expect(slugs).not.toContain('old-seasonal');
  });
});

describe('getProducts — anonymous, no auth required', () => {
  it('lists only active products with correct pagination meta', async () => {
    const getProducts = httpsCallable<unknown, GetProductsResult>(functions, 'getProducts');
    const result = await getProducts({ limit: 10 });
    const slugs = result.data.products.map((p) => p.slug);
    expect(slugs).toEqual(expect.arrayContaining(['fresh-almonds', 'cashew-nuts', 'walnut-halves']));
    expect(slugs).not.toContain('discontinued-raisins');
    expect(result.data.meta.total).toBe(3);
  });

  it('category query — filters to the requested categorySlug', async () => {
    const getProducts = httpsCallable<unknown, GetProductsResult>(functions, 'getProducts');
    const result = await getProducts({ categorySlug: 'dry-fruits', limit: 10 });
    expect(result.data.products.every((p) => p.categoryId === 'dry-fruits')).toBe(true);
    expect(result.data.products.length).toBe(3);
  });

  it('sorts by price ascending using the denormalized minPricePaise field', async () => {
    const getProducts = httpsCallable<unknown, GetProductsResult>(functions, 'getProducts');
    const result = await getProducts({ sort: 'price', order: 'asc', limit: 10 });
    const prices = result.data.products.map((p) => p.minPricePaise);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('paginates correctly with limit + page', async () => {
    const getProducts = httpsCallable<unknown, GetProductsResult>(functions, 'getProducts');
    const page1 = await getProducts({ limit: 2, page: 1, sort: 'name', order: 'asc' });
    const page2 = await getProducts({ limit: 2, page: 2, sort: 'name', order: 'asc' });
    expect(page1.data.products.length).toBe(2);
    expect(page2.data.products.length).toBe(1);
    expect(page1.data.meta).toMatchObject({ page: 1, hasNext: true, hasPrev: false });
    expect(page2.data.meta).toMatchObject({ page: 2, hasNext: false, hasPrev: true });
  });
});

describe('getProductBySlug — slug lookup', () => {
  it('returns the product for an existing active slug', async () => {
    const getProductBySlug = httpsCallable<{ slug: string }, ProductResponse>(functions, 'getProductBySlug');
    const result = await getProductBySlug({ slug: 'fresh-almonds' });
    expect(result.data.name).toBe('Fresh Almonds');
    expect(result.data.defaultVariant?.pricePaise).toBe(10000);
  });

  it('rejects a missing slug with not-found', async () => {
    const getProductBySlug = httpsCallable(functions, 'getProductBySlug');
    await expect(getProductBySlug({ slug: 'does-not-exist' })).rejects.toMatchObject({ code: 'functions/not-found' });
  });

  it('rejects an inactive product slug with not-found (matches the Express API: 404, not a distinct "inactive" signal)', async () => {
    const getProductBySlug = httpsCallable(functions, 'getProductBySlug');
    await expect(getProductBySlug({ slug: 'discontinued-raisins' })).rejects.toMatchObject({
      code: 'functions/not-found',
    });
  });
});

describe('getFeaturedProducts — featured query', () => {
  it('returns only isFeatured products', async () => {
    const getFeaturedProducts = httpsCallable<unknown, { products: ProductResponse[] }>(functions, 'getFeaturedProducts');
    const result = await getFeaturedProducts({ limit: 10 });
    expect(result.data.products.map((p) => p.slug)).toEqual(['fresh-almonds']);
  });
});

describe('getTrendingProducts — bestSeller → featured → newest fallback', () => {
  it('returns the bestSeller product when at least one exists', async () => {
    const getTrendingProducts = httpsCallable<unknown, { products: ProductResponse[] }>(functions, 'getTrendingProducts');
    const result = await getTrendingProducts({ limit: 10 });
    expect(result.data.products.map((p) => p.slug)).toEqual(['cashew-nuts']);
  });
});
