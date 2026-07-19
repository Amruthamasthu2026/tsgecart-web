/**
 * READ-ONLY MySQL → Firestore import-ready JSON export for product
 * variants and inventory (Firebase migration Phase 4). This script only
 * SELECTs from the existing database — it never writes to MySQL, never
 * calls any Firebase API, and is NOT wired into any npm lifecycle script
 * that runs automatically.
 *
 * A focused, flat export (unlike `exportProductsFromMysql.ts`, which
 * nests a lightweight variant summary under each product for the Phase 3
 * catalog import) — this one carries every `ProductVariant`/`Inventory`
 * field Phase 4's Firestore schema needs (`weightGrams`,
 * `lowStockThreshold`), for a variants/inventory-only resync that doesn't
 * require re-exporting full product content.
 *
 * Usage (NOT executed as part of this migration phase):
 *   npm run --workspace backend export:firebase-variants > backend/scripts/output/variants-export.json
 *
 * Output feeds firebase/functions/scripts/importVariantsToFirestore.ts —
 * the (also not auto-executed, dry-run-by-default) counterpart that writes
 * to Firestore.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ExportedInventoryVariant {
  sku: string;
  productSlug: string;
  unitLabel: string;
  mrp: string;
  price: string;
  weightGrams: number | null;
  isActive: boolean;
  isDefault: boolean;
  stock: number;
  reserved: number;
  lowStockThreshold: number;
}

interface VariantRow {
  sku: string;
  unitLabel: string;
  mrp: { toString(): string };
  price: { toString(): string };
  weightGrams: number | null;
  isActive: boolean;
  isDefault: boolean;
}

interface InventoryRow {
  stock: number;
  reserved: number;
  lowStockThreshold: number;
}

/** Pure — no Prisma call — unit-testable on its own. */
export function toExportedInventoryVariant(
  row: VariantRow,
  productSlug: string,
  inventory: InventoryRow | null,
): ExportedInventoryVariant {
  return {
    sku: row.sku,
    productSlug,
    unitLabel: row.unitLabel,
    mrp: row.mrp.toString(),
    price: row.price.toString(),
    weightGrams: row.weightGrams,
    isActive: row.isActive,
    isDefault: row.isDefault,
    stock: inventory?.stock ?? 0,
    reserved: inventory?.reserved ?? 0,
    lowStockThreshold: inventory?.lowStockThreshold ?? 10,
  };
}

async function main(): Promise<void> {
  const variants = await prisma.productVariant.findMany({
    include: { product: { select: { slug: true } }, inventory: true },
    orderBy: { createdAt: 'asc' },
  });

  const exported: ExportedInventoryVariant[] = variants.map((v) =>
    toExportedInventoryVariant(v, v.product.slug, v.inventory),
  );

  process.stdout.write(JSON.stringify({ variants: exported }, null, 2));
  process.stderr.write(`\nExported ${exported.length} variant(s). MySQL was not modified (read-only).\n`);
}

main()
  .catch((err: unknown) => {
    console.error('Export failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
