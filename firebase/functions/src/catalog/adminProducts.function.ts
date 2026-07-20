import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin';
import { requirePermission } from '../shared/auth';
import { parseInput } from '../shared/validation';
import { AppError, NotFoundError, BadRequestError } from '../shared/errors';
import { computeAvailable, computeIsLowStock } from '../inventory/inventory';
import {
  slugify,
  slugCandidate,
  ensureSingleDefaultVariant,
  computeMinMaxPricePaise,
  computeDefaultVariantSnapshot,
} from './adminProducts.logic';
import type { FirestoreProductDoc } from './catalog.types';
import type { FirestoreCategoryDoc } from './catalog.types';

/**
 * Admin product create/update/delete, migration Phase 6 — ports
 * `POST/PUT/DELETE /products` (`backend/src/modules/products/products.service.ts`).
 * `products`/`productVariants` are direct-client-writable by STAFF/ADMIN
 * per firestore.rules (unchanged since Phase 3/4), but `inventory` is
 * Function-only always — so any write that touches variants must go
 * through a Function regardless, and this one handles the whole
 * product+variants+inventory write atomically for consistency.
 *
 * Faithfully replicates Express's "replace-all" variant semantics
 * (`products.service.ts`'s `update()`): every upsert with a `variants`
 * array DELETES every existing variant+inventory doc for the product and
 * recreates them fresh from the payload — including `stock`, which is
 * NOT preserved from the prior state. This is a real, pre-existing
 * quirk of the source system (confirmed via the Phase 6 research pass),
 * not something introduced here — see the Phase 6 completion report.
 */

const adminVariantInputSchema = z.object({
  sku: z.string().min(1).max(60),
  unitLabel: z.string().min(1).max(40),
  mrpPaise: z.number().int().positive(),
  pricePaise: z.number().int().positive(),
  weightGrams: z.number().int().positive().nullish().transform((v) => v ?? null),
  isActive: z.boolean().nullish().transform((v) => v ?? true),
  isDefault: z.boolean().nullish().transform((v) => v ?? false),
  stock: z.number().int().min(0).nullish().transform((v) => v ?? 0),
  lowStockThreshold: z.number().int().min(0).nullish().transform((v) => v ?? 10),
});

const adminUpsertProductSchema = z.object({
  slug: z.string().min(1).max(160).nullish().transform((v) => v ?? null),
  name: z.string().min(2).max(200),
  description: z.string().max(5000).nullish().transform((v) => v ?? null),
  categoryId: z.string().min(1),
  brandId: z.string().max(80).nullish().transform((v) => v ?? null),
  brandName: z.string().max(120).nullish().transform((v) => v ?? null),
  images: z.array(z.string().max(500)).default([]),
  gstRatePercent: z.number().min(0).max(28).nullish().transform((v) => v ?? 0),
  hsnCode: z.string().max(20).nullish().transform((v) => v ?? null),
  isActive: z.boolean().nullish().transform((v) => v ?? true),
  isFeatured: z.boolean().nullish().transform((v) => v ?? false),
  isBestSeller: z.boolean().nullish().transform((v) => v ?? false),
  metaTitle: z.string().max(160).nullish().transform((v) => v ?? null),
  metaDescription: z.string().max(300).nullish().transform((v) => v ?? null),
  variants: z.array(adminVariantInputSchema).min(1),
});

export type AdminUpsertProductInput = z.output<typeof adminUpsertProductSchema>;

async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || 'product';
  for (let attempt = 1; attempt <= 25; attempt++) {
    const candidate = slugCandidate(base, attempt);
    const snap = await db.collection('products').doc(candidate).get();
    if (!snap.exists) return candidate;
  }
  throw new BadRequestError('Could not generate a unique product slug, please try a different name');
}

export async function adminUpsertProductTx(input: AdminUpsertProductInput): Promise<{ slug: string }> {
  const isCreate = !input.slug;
  const slug = isCreate ? await generateUniqueSlug(input.name) : (input.slug as string);
  const variants = ensureSingleDefaultVariant(input.variants);
  const { minPricePaise, maxPricePaise } = computeMinMaxPricePaise(variants);
  const defaultVariant = computeDefaultVariantSnapshot(variants);

  const productRef = db.collection('products').doc(slug);
  const variantsCollection = db.collection('productVariants');
  const inventoryCollection = db.collection('inventory');

  await db.runTransaction(async (tx) => {
    const [productSnap, categorySnap, existingVariantsSnap] = await Promise.all([
      tx.get(productRef),
      tx.get(db.collection('categories').doc(input.categoryId)),
      tx.get(variantsCollection.where('productId', '==', slug)),
    ]);

    if (!isCreate && !productSnap.exists) throw new NotFoundError('Product not found');
    if (!categorySnap.exists) throw new BadRequestError('Category not found');
    const category = categorySnap.data() as FirestoreCategoryDoc;
    const existing = productSnap.exists ? (productSnap.data() as FirestoreProductDoc) : null;

    const now = FieldValue.serverTimestamp();
    const productDoc: FirestoreProductDoc = {
      name: input.name,
      slug,
      description: input.description,
      categoryId: input.categoryId,
      categoryName: category.name,
      brandId: input.brandId,
      brandName: input.brandName,
      images: input.images,
      gstRatePercent: input.gstRatePercent,
      hsnCode: input.hsnCode,
      isActive: input.isActive,
      isFeatured: input.isFeatured,
      isBestSeller: input.isBestSeller,
      ratingAvg: existing?.ratingAvg ?? 0,
      ratingCount: existing?.ratingCount ?? 0,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
      minPricePaise,
      maxPricePaise,
      defaultVariant,
      createdAt: existing?.createdAt ?? (now as unknown as Timestamp),
      updatedAt: now as unknown as Timestamp,
    };
    tx.set(productRef, productDoc);

    // Replace-all: delete every existing variant + its inventory doc, then
    // recreate fresh from the payload (see file header comment).
    for (const doc of existingVariantsSnap.docs) {
      tx.delete(doc.ref);
      tx.delete(inventoryCollection.doc(doc.id));
    }
    for (const v of variants) {
      tx.set(variantsCollection.doc(v.sku), {
        productId: slug,
        unitLabel: v.unitLabel,
        mrpPaise: v.mrpPaise,
        pricePaise: v.pricePaise,
        weightGrams: v.weightGrams,
        isActive: v.isActive,
        isDefault: v.isDefault,
        availableStock: computeAvailable(v.stock, 0),
        createdAt: now,
        updatedAt: now,
      });
      tx.set(inventoryCollection.doc(v.sku), {
        stock: v.stock,
        reserved: 0,
        lowStockThreshold: v.lowStockThreshold,
        isLowStock: computeIsLowStock(v.stock, 0, v.lowStockThreshold),
        updatedAt: now,
      });
    }
  });

  return { slug };
}

export const adminUpsertProduct = onCall(async (request: CallableRequest) => {
  try {
    requirePermission(request, 'products.manage');
    const input = parseInput(adminUpsertProductSchema, request.data);
    return await adminUpsertProductTx(input);
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

const adminDeleteProductSchema = z.object({ slug: z.string().min(1) });

export async function adminDeleteProductTx(slug: string): Promise<void> {
  const productRef = db.collection('products').doc(slug);
  const variantsCollection = db.collection('productVariants');
  const inventoryCollection = db.collection('inventory');

  await db.runTransaction(async (tx) => {
    const [productSnap, variantsSnap] = await Promise.all([tx.get(productRef), tx.get(variantsCollection.where('productId', '==', slug))]);
    if (!productSnap.exists) throw new NotFoundError('Product not found');

    for (const doc of variantsSnap.docs) {
      tx.delete(doc.ref);
      tx.delete(inventoryCollection.doc(doc.id));
    }
    tx.delete(productRef);
  });
}

export const adminDeleteProduct = onCall(async (request: CallableRequest) => {
  try {
    requirePermission(request, 'products.manage');
    const { slug } = parseInput(adminDeleteProductSchema, request.data);
    await adminDeleteProductTx(slug);
    return { deleted: true };
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});
