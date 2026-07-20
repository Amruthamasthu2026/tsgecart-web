import type { FirestoreDefaultVariant } from './catalog.types';

/**
 * Pure product/variant admin logic, migration Phase 6, mirroring
 * `backend/src/modules/products/products.service.ts`'s `generateUniqueSlug`
 * and `ensureSingleDefault` exactly. Kept side-effect-free (Firestore
 * existence checks for slug uniqueness live in adminProducts.function.ts)
 * so the exact slugification/default-selection rules are independently
 * unit-testable.
 */

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

/** `base`, `base-2`, `base-3`, ... — same pattern as the Express admin product create flow. */
export function slugCandidate(base: string, attempt: number): string {
  return attempt <= 1 ? base : `${base}-${attempt}`;
}

export interface AdminVariantInput {
  sku: string;
  unitLabel: string;
  mrpPaise: number;
  pricePaise: number;
  weightGrams: number | null;
  isActive: boolean;
  isDefault: boolean;
  stock: number;
  lowStockThreshold: number;
}

/**
 * Exactly one variant ends up `isDefault: true`: if the admin marked more
 * than one, only the first survives; if none, the first variant becomes
 * the default. Mirrors `products.service.ts`'s `ensureSingleDefault`.
 */
export function ensureSingleDefaultVariant(variants: AdminVariantInput[]): AdminVariantInput[] {
  const firstDefaultIndex = variants.findIndex((v) => v.isDefault);
  const defaultIndex = firstDefaultIndex === -1 ? 0 : firstDefaultIndex;
  return variants.map((v, i) => ({ ...v, isDefault: i === defaultIndex }));
}

export function computeMinMaxPricePaise(variants: AdminVariantInput[]): { minPricePaise: number; maxPricePaise: number } {
  const prices = variants.map((v) => v.pricePaise);
  return { minPricePaise: Math.min(...prices), maxPricePaise: Math.max(...prices) };
}

export function computeDefaultVariantSnapshot(variants: AdminVariantInput[]): FirestoreDefaultVariant | null {
  const def = variants.find((v) => v.isDefault) ?? variants[0];
  if (!def) return null;
  return { sku: def.sku, unitLabel: def.unitLabel, mrpPaise: def.mrpPaise, pricePaise: def.pricePaise, stock: def.stock };
}
