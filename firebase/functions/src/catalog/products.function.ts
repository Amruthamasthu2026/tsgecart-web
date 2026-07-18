import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import type { CollectionReference, Query } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin';
import { parseInput } from '../shared/validation';
import { AppError, NotFoundError } from '../shared/errors';
import { buildPaginationMeta, type PaginationMeta } from '../shared/pagination';
import type { FirestoreProductDoc, ProductResponse } from './catalog.types';
import {
  buildProductsQueryPlan,
  pickTrendingList,
  productDocToResponse,
  type GetProductsInput,
  type ProductsQueryPlan,
} from './catalog.queries';

/**
 * Public, read-only catalog Callable Functions (migration Phase 3,
 * objective "STEP 2"). None of these require authentication — they read
 * only `isActive: true` documents, matching firestore.rules' public-read
 * scope for `products`/`categories`. Kept as Callable Functions (not
 * `onRequest`) for consistent typed request/response shapes and reuse of
 * the same client SDK (`firebase/functions`) already wired up for auth in
 * Phase 2.
 */

const productsCollection = () =>
  db.collection('products') as CollectionReference<FirestoreProductDoc>;

// The Firebase client SDK's callable wire protocol serializes an omitted
// (`undefined`) field as JSON `null`, not as an absent key — so every
// optional field here must accept `null` too (`.nullish()`, normalized back
// to `undefined`), or a perfectly ordinary "just don't pass this filter"
// call from the frontend fails validation.
const nullishString = (max?: number) =>
  (max ? z.string().max(max) : z.string().min(1)).nullish().transform((v) => v ?? undefined);
const nullishBoolean = () => z.boolean().nullish().transform((v) => v ?? undefined);

const getProductsSchema = z.object({
  categorySlug: nullishString(),
  featured: nullishBoolean(),
  bestSeller: nullishBoolean(),
  search: nullishString(100),
  sort: z.enum(['createdAt', 'name', 'ratingAvg', 'price']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(60).default(24),
});

function applyProductsQueryPlan(plan: ProductsQueryPlan): Query<FirestoreProductDoc> {
  let q = productsCollection().where('isActive', '==', true);
  if (plan.categorySlug) q = q.where('categoryId', '==', plan.categorySlug);
  if (plan.featured !== undefined) q = q.where('isFeatured', '==', plan.featured);
  if (plan.bestSeller !== undefined) q = q.where('isBestSeller', '==', plan.bestSeller);

  if (plan.namePrefix) {
    // Best-effort prefix match — Firestore has no `contains`/full-text
    // search. The appended codepoint is a high Unicode private-use
    // character that sorts after virtually any real string, making this a
    // "starts with" range query.
    q = q.orderBy('name').startAt(plan.namePrefix).endAt(plan.namePrefix + '');
  } else {
    q = q.orderBy(plan.orderByField, plan.orderByDirection);
  }
  return q;
}

export interface GetProductsResult {
  products: ProductResponse[];
  meta: PaginationMeta;
}

export async function fetchProducts(input: GetProductsInput): Promise<GetProductsResult> {
  const plan = buildProductsQueryPlan(input);
  const filtered = applyProductsQueryPlan(plan);

  const countSnap = await filtered.count().get();
  const total = countSnap.data().count;

  const pageSnap = await filtered.offset(plan.offset).limit(plan.limit).get();
  const products = pageSnap.docs.map(productDocToResponse);

  return { products, meta: buildPaginationMeta(input.page, input.limit, total) };
}

export const getProducts = onCall(async (request: CallableRequest) => {
  try {
    const input = parseInput<GetProductsInput>(getProductsSchema, request.data ?? {});
    return await fetchProducts(input);
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

const getProductBySlugSchema = z.object({ slug: z.string().min(1) });

export async function fetchProductBySlug(slug: string): Promise<ProductResponse> {
  const snap = await productsCollection().doc(slug).get();
  if (!snap.exists) {
    throw new NotFoundError(`No product with slug "${slug}"`);
  }
  const data = snap.data();
  if (!data || !data.isActive) {
    // Matches the Express API: an inactive product 404s exactly like a
    // missing one — no distinction is exposed to an unauthenticated caller.
    throw new NotFoundError(`No product with slug "${slug}"`);
  }
  return productDocToResponse(snap as FirebaseFirestore.QueryDocumentSnapshot<FirestoreProductDoc>);
}

export const getProductBySlug = onCall(async (request: CallableRequest) => {
  try {
    const { slug } = parseInput(getProductBySlugSchema, request.data);
    return await fetchProductBySlug(slug);
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

const limitSchema = z.object({ limit: z.number().int().min(1).max(60).default(12) });

export async function fetchFeaturedProducts(limit: number): Promise<ProductResponse[]> {
  const snap = await productsCollection()
    .where('isActive', '==', true)
    .where('isFeatured', '==', true)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(productDocToResponse);
}

export const getFeaturedProducts = onCall(async (request: CallableRequest) => {
  try {
    const { limit } = parseInput(limitSchema, request.data ?? {});
    return { products: await fetchFeaturedProducts(limit) };
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

const trendingLimitSchema = z.object({ limit: z.number().int().min(1).max(60).default(8) });

export async function fetchTrendingProducts(limit: number): Promise<ProductResponse[]> {
  const [bestSellerSnap, featuredSnap, latestSnap] = await Promise.all([
    productsCollection()
      .where('isActive', '==', true)
      .where('isBestSeller', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get(),
    productsCollection()
      .where('isActive', '==', true)
      .where('isFeatured', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get(),
    productsCollection().where('isActive', '==', true).orderBy('createdAt', 'desc').limit(limit).get(),
  ]);

  const bestSellers = bestSellerSnap.docs.map(productDocToResponse);
  const featured = featuredSnap.docs.map(productDocToResponse);
  const latest = latestSnap.docs.map(productDocToResponse);

  return pickTrendingList(bestSellers, featured, latest);
}

export const getTrendingProducts = onCall(async (request: CallableRequest) => {
  try {
    const { limit } = parseInput(trendingLimitSchema, request.data ?? {});
    return { products: await fetchTrendingProducts(limit) };
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});
