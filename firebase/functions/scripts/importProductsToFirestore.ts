/**
 * NOT EXECUTED AUTOMATICALLY. Imports products and categories into
 * Firestore from the JSON produced by
 * `backend/scripts/exportProductsFromMysql.ts` (Firebase migration Phase 3,
 * "STEP 3").
 *
 * Safe by default: with no flag this is a DRY RUN — it reads, validates,
 * and transforms every record and prints a summary, writing nothing.
 * `--execute` is required to actually write. This script is never invoked
 * by any npm lifecycle hook, build step, or CI job — a human operator runs
 * it manually, against whichever Firestore project their environment is
 * currently pointed at (real project or the Local Emulator Suite).
 *
 * Usage:
 *   npx tsx scripts/importProductsToFirestore.ts <path-to-export.json>              # dry run (default)
 *   npx tsx scripts/importProductsToFirestore.ts <path-to-export.json> --execute    # real write
 */
import { readFileSync } from 'node:fs';
import { rupeesToPaise } from '../src/shared/money';
import { logger } from '../src/shared/logger';
import type { FirestoreCategoryDoc, FirestoreDefaultVariant, FirestoreProductDoc } from '../src/catalog/catalog.types';

export interface ExportedVariant {
  sku: string;
  unitLabel: string;
  mrp: string;
  price: string;
  isActive: boolean;
  isDefault: boolean;
  stock: number;
  reserved: number;
}

export interface ExportedProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  categorySlug: string;
  categoryName: string;
  brandSlug: string | null;
  brandName: string | null;
  images: string[];
  gstRate: string;
  hsnCode: string | null;
  isActive: boolean;
  isFeatured: boolean;
  isBestSeller: boolean;
  ratingAvg: string;
  ratingCount: number;
  metaTitle: string | null;
  metaDescription: string | null;
  variants: ExportedVariant[];
}

export interface ExportedCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentSlug: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

export interface ExportPayload {
  categories: ExportedCategory[];
  products: ExportedProduct[];
}

export type FirestoreCategoryWrite = Omit<FirestoreCategoryDoc, 'createdAt' | 'updatedAt'>;
export type FirestoreProductWrite = Omit<FirestoreProductDoc, 'createdAt' | 'updatedAt'>;

/** Pure — no Admin SDK, no file I/O — unit-testable on its own. */
export function toFirestoreCategoryDoc(category: ExportedCategory): FirestoreCategoryWrite {
  return {
    name: category.name,
    slug: category.slug,
    description: category.description,
    imageUrl: category.imageUrl,
    parentId: category.parentSlug,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    productCount: category.productCount,
  };
}

/**
 * Picks the variant that represents the product in listings/cards: the one
 * explicitly flagged `isDefault`, else the cheapest active variant, else
 * null (a product with no active variants shows no price — same as the
 * existing Express API returning an empty `variants` array).
 */
export function pickDefaultVariant(variants: ExportedVariant[]): ExportedVariant | null {
  const active = variants.filter((v) => v.isActive);
  if (active.length === 0) return null;
  const flagged = active.find((v) => v.isDefault);
  if (flagged) return flagged;
  return active.reduce((cheapest, v) => (Number(v.price) < Number(cheapest.price) ? v : cheapest));
}

/** Pure — no Admin SDK, no file I/O — unit-testable on its own. */
export function toFirestoreProductDoc(product: ExportedProduct): FirestoreProductWrite {
  const activeVariants = product.variants.filter((v) => v.isActive);
  const prices = activeVariants.map((v) => rupeesToPaise(v.price));
  const minPricePaise = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPricePaise = prices.length > 0 ? Math.max(...prices) : 0;

  const chosen = pickDefaultVariant(product.variants);
  const defaultVariant: FirestoreDefaultVariant | null = chosen
    ? {
        sku: chosen.sku,
        unitLabel: chosen.unitLabel,
        mrpPaise: rupeesToPaise(chosen.mrp),
        pricePaise: rupeesToPaise(chosen.price),
        stock: Math.max(0, chosen.stock - chosen.reserved),
      }
    : null;

  return {
    name: product.name,
    slug: product.slug,
    description: product.description,
    categoryId: product.categorySlug,
    categoryName: product.categoryName,
    brandId: product.brandSlug,
    brandName: product.brandName,
    images: product.images,
    gstRatePercent: Number(product.gstRate),
    hsnCode: product.hsnCode,
    isActive: product.isActive,
    isFeatured: product.isFeatured,
    isBestSeller: product.isBestSeller,
    ratingAvg: Number(product.ratingAvg),
    ratingCount: product.ratingCount,
    metaTitle: product.metaTitle,
    metaDescription: product.metaDescription,
    minPricePaise,
    maxPricePaise,
    defaultVariant,
  };
}

export interface ParsedArgs {
  filePath: string;
  execute: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const execute = argv.includes('--execute');
  const filePath = argv.find((a) => !a.startsWith('--'));
  if (!filePath) {
    throw new Error('Usage: importProductsToFirestore.ts <path-to-export.json> [--execute]');
  }
  return { filePath, execute };
}

async function main(): Promise<void> {
  const { filePath, execute } = parseArgs(process.argv.slice(2));
  const raw = readFileSync(filePath, 'utf8');
  const payload = JSON.parse(raw) as ExportPayload;

  const categoryWrites = payload.categories.map((c) => ({ slug: c.slug, doc: toFirestoreCategoryDoc(c) }));
  const productWrites = payload.products.map((p) => ({ slug: p.slug, doc: toFirestoreProductDoc(p) }));

  logger.info('Loaded catalog import records', {
    categories: categoryWrites.length,
    products: productWrites.length,
  });
  console.log(
    `Loaded ${categoryWrites.length} categor${categoryWrites.length === 1 ? 'y' : 'ies'} and ${productWrites.length} product(s) from ${filePath}.`,
  );
  if (productWrites[0]) {
    console.log('Sample product write:', productWrites[0]);
  }

  if (!execute) {
    console.log('\nDRY RUN — nothing was written to Firestore. Re-run with --execute to perform the real import.');
    return;
  }

  // Lazy import so `db`/`initializeApp()` is never touched during a dry run
  // or during unit tests importing this module for its pure helpers.
  const { db } = await import('../src/config/firebaseAdmin');
  const { FieldValue } = await import('firebase-admin/firestore');

  console.log('\nEXECUTING real Firestore writes...');

  let categoryBatch = db.batch();
  let opsInBatch = 0;
  const commitIfFull = async () => {
    if (opsInBatch >= 400) {
      await categoryBatch.commit();
      categoryBatch = db.batch();
      opsInBatch = 0;
    }
  };

  for (const { slug, doc } of categoryWrites) {
    categoryBatch.set(db.collection('categories').doc(slug), {
      ...doc,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    opsInBatch += 1;
    await commitIfFull();
  }
  for (const { slug, doc } of productWrites) {
    categoryBatch.set(db.collection('products').doc(slug), {
      ...doc,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    opsInBatch += 1;
    await commitIfFull();
  }
  if (opsInBatch > 0) {
    await categoryBatch.commit();
  }

  logger.info('Firestore import complete', {
    categories: categoryWrites.length,
    products: productWrites.length,
  });
  console.log(`Wrote ${categoryWrites.length} categories and ${productWrites.length} products.`);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('Import failed:', err);
    process.exitCode = 1;
  });
}
