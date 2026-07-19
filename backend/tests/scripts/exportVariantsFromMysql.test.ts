import { describe, it, expect } from 'vitest';
import { toExportedInventoryVariant } from '../../scripts/exportVariantsFromMysql.js';

const baseRow = {
  sku: 'ALM-500',
  unitLabel: '500 g',
  mrp: { toString: () => '649.00' },
  price: { toString: () => '549.00' },
  weightGrams: 500,
  isActive: true,
  isDefault: true,
};

describe('toExportedInventoryVariant', () => {
  it('stringifies mrp/price via toString() and carries productSlug through', () => {
    const result = toExportedInventoryVariant(baseRow, 'premium-almonds', { stock: 25, reserved: 3, lowStockThreshold: 5 });
    expect(result.mrp).toBe('649.00');
    expect(result.price).toBe('549.00');
    expect(result.productSlug).toBe('premium-almonds');
  });

  it('carries weightGrams through, including null', () => {
    expect(toExportedInventoryVariant(baseRow, 'x', null).weightGrams).toBe(500);
    expect(toExportedInventoryVariant({ ...baseRow, weightGrams: null }, 'x', null).weightGrams).toBeNull();
  });

  it('defaults stock/reserved to 0 and lowStockThreshold to 10 when there is no inventory row', () => {
    const result = toExportedInventoryVariant(baseRow, 'x', null);
    expect(result.stock).toBe(0);
    expect(result.reserved).toBe(0);
    expect(result.lowStockThreshold).toBe(10);
  });

  it('carries real inventory numbers through when present', () => {
    const result = toExportedInventoryVariant(baseRow, 'x', { stock: 40, reserved: 5, lowStockThreshold: 8 });
    expect(result.stock).toBe(40);
    expect(result.reserved).toBe(5);
    expect(result.lowStockThreshold).toBe(8);
  });

  it('carries isActive/isDefault through unchanged', () => {
    const result = toExportedInventoryVariant({ ...baseRow, isActive: false, isDefault: false }, 'x', null);
    expect(result.isActive).toBe(false);
    expect(result.isDefault).toBe(false);
  });
});
