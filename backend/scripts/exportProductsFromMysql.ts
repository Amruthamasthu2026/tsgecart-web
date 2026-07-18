/**
 * READ-ONLY MySQL → Firestore import-ready JSON export for products and
 * categories (Firebase migration Phase 3, "STEP 3"). This script only
 * SELECTs from the existing database — it never writes to MySQL, never
 * calls any Firebase API, and is NOT wired into any npm lifecycle script
 * that runs automatically.
 *
 * Usage (NOT executed as part of this migration phase — there is no
 * automated trigger for it):
 *   npm run --workspace backend export:firebase-products > backend/scripts/output/products-export.json
 *
 * Output feeds firebase/functions/scripts/importProductsToFirestore.ts —
 * the (also not auto-executed, dry-run-by-default) counterpart that writes
 * to Firestore.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}

/** Pure — no Prisma call — unit-testable on its own. */
export function toExportedCategory(
  row: CategoryRow,
  parentSlug: string | null,
  productCount: number,
): ExportedCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    imageUrl: row.imageUrl,
    parentSlug,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    productCount,
  };
}

interface VariantRow {
  sku: string;
  unitLabel: string;
  mrp: { toString(): string };
  price: { toString(): string };
  isActive: boolean;
  isDefault: boolean;
}

/** Pure — unit-testable on its own. */
export function toExportedVariant(row: VariantRow, stock: number, reserved: number): ExportedVariant {
  return {
    sku: row.sku,
    unitLabel: row.unitLabel,
    mrp: row.mrp.toString(),
    price: row.price.toString(),
    isActive: row.isActive,
    isDefault: row.isDefault,
    stock,
    reserved,
  };
}

interface ProductRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  images: unknown;
  gstRate: { toString(): string };
  hsnCode: string | null;
  isActive: boolean;
  isFeatured: boolean;
  isBestSeller: boolean;
  ratingAvg: { toString(): string };
  ratingCount: number;
  metaTitle: string | null;
  metaDescription: string | null;
}

/** Pure — unit-testable on its own. */
export function toExportedProduct(
  row: ProductRow,
  category: { slug: string; name: string },
  brand: { slug: string; name: string } | null,
  variants: ExportedVariant[],
): ExportedProduct {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    categorySlug: category.slug,
    categoryName: category.name,
    brandSlug: brand?.slug ?? null,
    brandName: brand?.name ?? null,
    images: Array.isArray(row.images) ? (row.images as string[]) : [],
    gstRate: row.gstRate.toString(),
    hsnCode: row.hsnCode,
    isActive: row.isActive,
    isFeatured: row.isFeatured,
    isBestSeller: row.isBestSeller,
    ratingAvg: row.ratingAvg.toString(),
    ratingCount: row.ratingCount,
    metaTitle: row.metaTitle,
    metaDescription: row.metaDescription,
    variants,
  };
}

async function main(): Promise<void> {
  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      include: { parent: { select: { slug: true } }, _count: { select: { products: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.product.findMany({
      include: {
        category: { select: { slug: true, name: true } },
        brand: { select: { slug: true, name: true } },
        variants: { include: { inventory: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const exportedCategories: ExportedCategory[] = categories.map((c) =>
    toExportedCategory(c, c.parent?.slug ?? null, c._count.products),
  );

  const exportedProducts: ExportedProduct[] = products.map((p) =>
    toExportedProduct(
      p,
      p.category,
      p.brand,
      p.variants.map((v) => toExportedVariant(v, v.inventory?.stock ?? 0, v.inventory?.reserved ?? 0)),
    ),
  );

  const output = { categories: exportedCategories, products: exportedProducts };
  process.stdout.write(JSON.stringify(output, null, 2));
  process.stderr.write(
    `\nExported ${exportedCategories.length} categor${exportedCategories.length === 1 ? 'y' : 'ies'} and ${exportedProducts.length} product(s). MySQL was not modified (read-only).\n`,
  );
}

main()
  .catch((err: unknown) => {
    console.error('Export failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
