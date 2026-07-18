import { describe, it, expect } from 'vitest';
import {
  toExportedCategory,
  toExportedProduct,
  toExportedVariant,
} from '../../scripts/exportProductsFromMysql.js';

describe('toExportedCategory', () => {
  it('maps parent slug and product count through', () => {
    const row = {
      id: 'c1',
      name: 'Dry Fruits',
      slug: 'dry-fruits',
      description: null,
      imageUrl: null,
      sortOrder: 2,
      isActive: true,
    };
    expect(toExportedCategory(row, 'groceries', 7)).toEqual({
      id: 'c1',
      name: 'Dry Fruits',
      slug: 'dry-fruits',
      description: null,
      imageUrl: null,
      parentSlug: 'groceries',
      sortOrder: 2,
      isActive: true,
      productCount: 7,
    });
  });

  it('handles a root category (no parent)', () => {
    const row = {
      id: 'c1',
      name: 'Groceries',
      slug: 'groceries',
      description: null,
      imageUrl: null,
      sortOrder: 0,
      isActive: true,
    };
    expect(toExportedCategory(row, null, 0).parentSlug).toBeNull();
  });
});

describe('toExportedVariant', () => {
  it('stringifies Decimal-like mrp/price via toString()', () => {
    const row = {
      sku: 'SKU-1',
      unitLabel: '1 kg',
      mrp: { toString: () => '250.00' },
      price: { toString: () => '199.00' },
      isActive: true,
      isDefault: true,
    };
    expect(toExportedVariant(row, 15, 3)).toEqual({
      sku: 'SKU-1',
      unitLabel: '1 kg',
      mrp: '250.00',
      price: '199.00',
      isActive: true,
      isDefault: true,
      stock: 15,
      reserved: 3,
    });
  });

  it('defaults stock/reserved to 0 when there is no inventory row (passed in as 0)', () => {
    const row = {
      sku: 'SKU-2',
      unitLabel: '500 g',
      mrp: { toString: () => '100.00' },
      price: { toString: () => '80.00' },
      isActive: true,
      isDefault: false,
    };
    expect(toExportedVariant(row, 0, 0)).toMatchObject({ stock: 0, reserved: 0 });
  });
});

describe('toExportedProduct', () => {
  const baseRow = {
    id: 'p1',
    name: 'Fresh Almonds',
    slug: 'fresh-almonds',
    description: 'Premium almonds',
    images: ['https://example.com/a.jpg'],
    gstRate: { toString: () => '5.00' },
    hsnCode: '0802',
    isActive: true,
    isFeatured: true,
    isBestSeller: false,
    ratingAvg: { toString: () => '4.50' },
    ratingCount: 12,
    metaTitle: null,
    metaDescription: null,
  };

  it('resolves category/brand refs to slug+name and carries variants through', () => {
    const result = toExportedProduct(
      baseRow,
      { slug: 'dry-fruits', name: 'Dry Fruits' },
      { slug: 'daily-fresh', name: 'Daily Fresh' },
      [],
    );
    expect(result.categorySlug).toBe('dry-fruits');
    expect(result.categoryName).toBe('Dry Fruits');
    expect(result.brandSlug).toBe('daily-fresh');
    expect(result.brandName).toBe('Daily Fresh');
  });

  it('handles a product with no brand', () => {
    const result = toExportedProduct(baseRow, { slug: 'dry-fruits', name: 'Dry Fruits' }, null, []);
    expect(result.brandSlug).toBeNull();
    expect(result.brandName).toBeNull();
  });

  it('falls back to an empty array when images is not an array (defensive against malformed JSON column)', () => {
    const result = toExportedProduct(
      { ...baseRow, images: null },
      { slug: 'dry-fruits', name: 'Dry Fruits' },
      null,
      [],
    );
    expect(result.images).toEqual([]);
  });

  it('stringifies gstRate/ratingAvg via toString()', () => {
    const result = toExportedProduct(baseRow, { slug: 'dry-fruits', name: 'Dry Fruits' }, null, []);
    expect(result.gstRate).toBe('5.00');
    expect(result.ratingAvg).toBe('4.50');
  });
});
