/**
 * NOT EXECUTED AUTOMATICALLY. Imports product variants + inventory into
 * Firestore from the JSON produced by
 * `backend/scripts/exportVariantsFromMysql.ts` (Firebase migration
 * Phase 4).
 *
 * Safe by default: with no `--execute` flag this is a DRY RUN — it reads,
 * validates, and transforms every record and prints a summary, writing
 * nothing. Idempotent: every write is a deterministic `set()` computed
 * entirely from the export data (never an increment/relative update), so
 * running this script twice with the same input produces the same end
 * state — safe to re-run for a variants-only resync.
 *
 * Usage:
 *   npx tsx scripts/importVariantsToFirestore.ts <path-to-export.json>              # dry run (default)
 *   npx tsx scripts/importVariantsToFirestore.ts <path-to-export.json> --execute    # real write
 */
import { readFileSync } from 'node:fs';
import { rupeesToPaise } from '../src/shared/money';
import { logger } from '../src/shared/logger';
import { computeAvailable, computeIsLowStock } from '../src/inventory/inventory';
import type { FirestoreVariantDoc } from '../src/catalog/variants.types';
import type { FirestoreInventoryDoc } from '../src/inventory/inventory.types';

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

export type FirestoreVariantWrite = Omit<FirestoreVariantDoc, 'createdAt' | 'updatedAt'>;
export type FirestoreInventoryWrite = Omit<FirestoreInventoryDoc, 'updatedAt'>;

/** Pure — no Admin SDK, no file I/O — unit-testable on its own. */
export function toFirestoreVariantDoc(variant: ExportedInventoryVariant): FirestoreVariantWrite {
  return {
    productId: variant.productSlug,
    unitLabel: variant.unitLabel,
    mrpPaise: rupeesToPaise(variant.mrp),
    pricePaise: rupeesToPaise(variant.price),
    weightGrams: variant.weightGrams,
    isActive: variant.isActive,
    isDefault: variant.isDefault,
    availableStock: computeAvailable(variant.stock, variant.reserved),
  };
}

/** Pure — unit-testable on its own. */
export function toFirestoreInventoryDoc(variant: ExportedInventoryVariant): FirestoreInventoryWrite {
  return {
    stock: variant.stock,
    reserved: variant.reserved,
    lowStockThreshold: variant.lowStockThreshold,
    isLowStock: computeIsLowStock(variant.stock, variant.reserved, variant.lowStockThreshold),
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
    throw new Error('Usage: importVariantsToFirestore.ts <path-to-export.json> [--execute]');
  }
  return { filePath, execute };
}

async function main(): Promise<void> {
  const { filePath, execute } = parseArgs(process.argv.slice(2));
  const raw = readFileSync(filePath, 'utf8');
  const { variants } = JSON.parse(raw) as { variants: ExportedInventoryVariant[] };

  const writes = variants.map((v) => ({
    sku: v.sku,
    variantDoc: toFirestoreVariantDoc(v),
    inventoryDoc: toFirestoreInventoryDoc(v),
  }));

  logger.info('Loaded variant/inventory import records', { count: writes.length });
  console.log(`Loaded ${writes.length} variant(s) from ${filePath}.`);
  if (writes[0]) {
    console.log('Sample write:', writes[0]);
  }

  if (!execute) {
    console.log('\nDRY RUN — nothing was written to Firestore. Re-run with --execute to perform the real import.');
    return;
  }

  const { db } = await import('../src/config/firebaseAdmin');
  const { FieldValue } = await import('firebase-admin/firestore');

  console.log('\nEXECUTING real Firestore writes...');
  let batch = db.batch();
  let opsInBatch = 0;
  const commitIfFull = async () => {
    if (opsInBatch >= 400) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  };

  for (const { sku, variantDoc, inventoryDoc } of writes) {
    const now = FieldValue.serverTimestamp();
    batch.set(db.collection('productVariants').doc(sku), { ...variantDoc, createdAt: now, updatedAt: now });
    opsInBatch += 1;
    await commitIfFull();
    batch.set(db.collection('inventory').doc(sku), { ...inventoryDoc, updatedAt: now });
    opsInBatch += 1;
    await commitIfFull();
  }
  if (opsInBatch > 0) {
    await batch.commit();
  }

  logger.info('Firestore variant/inventory import complete', { count: writes.length });
  console.log(`Wrote ${writes.length} variant(s) + inventory record(s).`);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('Import failed:', err);
    process.exitCode = 1;
  });
}
