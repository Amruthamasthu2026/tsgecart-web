import { describe, it, expect } from 'vitest';
import {
  toFirestoreVariantDoc,
  toFirestoreInventoryDoc,
  parseArgs,
  type ExportedInventoryVariant,
} from '../../scripts/importVariantsToFirestore';

function variant(overrides: Partial<ExportedInventoryVariant> = {}): ExportedInventoryVariant {
  return {
    sku: 'ALM-500',
    productSlug: 'premium-almonds',
    unitLabel: '500 g',
    mrp: '649.00',
    price: '549.00',
    weightGrams: 500,
    isActive: true,
    isDefault: true,
    stock: 25,
    reserved: 3,
    lowStockThreshold: 5,
    ...overrides,
  };
}

describe('toFirestoreVariantDoc', () => {
  it('converts mrp/price to paise and productSlug to productId', () => {
    const doc = toFirestoreVariantDoc(variant());
    expect(doc.mrpPaise).toBe(64900);
    expect(doc.pricePaise).toBe(54900);
    expect(doc.productId).toBe('premium-almonds');
  });

  it('computes availableStock as stock minus reserved', () => {
    expect(toFirestoreVariantDoc(variant({ stock: 25, reserved: 3 })).availableStock).toBe(22);
  });

  it('clamps availableStock at 0 when reserved exceeds stock', () => {
    expect(toFirestoreVariantDoc(variant({ stock: 2, reserved: 5 })).availableStock).toBe(0);
  });

  it('carries weightGrams/isActive/isDefault/unitLabel through unchanged', () => {
    const doc = toFirestoreVariantDoc(variant({ weightGrams: null, isActive: false, isDefault: false }));
    expect(doc.weightGrams).toBeNull();
    expect(doc.isActive).toBe(false);
    expect(doc.isDefault).toBe(false);
    expect(doc.unitLabel).toBe('500 g');
  });

  it('does not include a gstRatePercent field (GST lives on the product, not the variant)', () => {
    expect(toFirestoreVariantDoc(variant())).not.toHaveProperty('gstRatePercent');
  });
});

describe('toFirestoreInventoryDoc', () => {
  it('carries stock/reserved/lowStockThreshold through unchanged', () => {
    const doc = toFirestoreInventoryDoc(variant({ stock: 40, reserved: 5, lowStockThreshold: 8 }));
    expect(doc.stock).toBe(40);
    expect(doc.reserved).toBe(5);
    expect(doc.lowStockThreshold).toBe(8);
  });

  it('computes isLowStock from available vs. threshold', () => {
    expect(toFirestoreInventoryDoc(variant({ stock: 10, reserved: 8, lowStockThreshold: 5 })).isLowStock).toBe(true);
    expect(toFirestoreInventoryDoc(variant({ stock: 100, reserved: 0, lowStockThreshold: 5 })).isLowStock).toBe(
      false,
    );
  });
});

describe('parseArgs', () => {
  it('defaults execute to false (dry run)', () => {
    expect(parseArgs(['export.json'])).toEqual({ filePath: 'export.json', execute: false });
  });

  it('sets execute true only with --execute', () => {
    expect(parseArgs(['export.json', '--execute'])).toEqual({ filePath: 'export.json', execute: true });
  });

  it('throws when no file path is given', () => {
    expect(() => parseArgs([])).toThrow();
  });
});
