import { describe, it, expect } from 'vitest';
import {
  toFirestoreCategoryDoc,
  toFirestoreProductDoc,
  pickDefaultVariant,
  parseArgs,
  type ExportedCategory,
  type ExportedProduct,
  type ExportedVariant,
} from '../../scripts/importProductsToFirestore';

function category(overrides: Partial<ExportedCategory> = {}): ExportedCategory {
  return {
    id: 'cat_1',
    name: 'Fruits & Vegetables',
    slug: 'fruits-vegetables',
    description: null,
    imageUrl: null,
    parentSlug: null,
    sortOrder: 0,
    isActive: true,
    productCount: 5,
    ...overrides,
  };
}

function variant(overrides: Partial<ExportedVariant> = {}): ExportedVariant {
  return {
    sku: 'SKU-1',
    unitLabel: '500 g',
    mrp: '100.00',
    price: '80.00',
    isActive: true,
    isDefault: false,
    stock: 20,
    reserved: 5,
    ...overrides,
  };
}

function product(overrides: Partial<ExportedProduct> = {}): ExportedProduct {
  return {
    id: 'prod_1',
    name: 'Fresh Almonds',
    slug: 'fresh-almonds',
    description: 'Premium almonds',
    categorySlug: 'dry-fruits',
    categoryName: 'Dry Fruits',
    brandSlug: null,
    brandName: null,
    images: ['https://example.com/almonds.jpg'],
    gstRate: '5.00',
    hsnCode: '0802',
    isActive: true,
    isFeatured: false,
    isBestSeller: false,
    ratingAvg: '4.50',
    ratingCount: 10,
    metaTitle: null,
    metaDescription: null,
    variants: [variant()],
    ...overrides,
  };
}

describe('toFirestoreCategoryDoc', () => {
  it('maps parentSlug to parentId', () => {
    const doc = toFirestoreCategoryDoc(category({ parentSlug: 'groceries' }));
    expect(doc.parentId).toBe('groceries');
  });

  it('carries name/slug/isActive/productCount through unchanged', () => {
    const doc = toFirestoreCategoryDoc(category({ name: 'Snacks', slug: 'snacks', isActive: false, productCount: 3 }));
    expect(doc).toMatchObject({ name: 'Snacks', slug: 'snacks', isActive: false, productCount: 3 });
  });
});

describe('pickDefaultVariant', () => {
  it('prefers the variant explicitly flagged isDefault', () => {
    const variants = [
      variant({ sku: 'A', price: '50.00', isDefault: false }),
      variant({ sku: 'B', price: '90.00', isDefault: true }),
    ];
    expect(pickDefaultVariant(variants)?.sku).toBe('B');
  });

  it('falls back to the cheapest active variant when none is flagged default', () => {
    const variants = [
      variant({ sku: 'A', price: '90.00' }),
      variant({ sku: 'B', price: '50.00' }),
      variant({ sku: 'C', price: '70.00' }),
    ];
    expect(pickDefaultVariant(variants)?.sku).toBe('B');
  });

  it('ignores inactive variants entirely', () => {
    const variants = [
      variant({ sku: 'A', price: '10.00', isActive: false }),
      variant({ sku: 'B', price: '90.00', isActive: true }),
    ];
    expect(pickDefaultVariant(variants)?.sku).toBe('B');
  });

  it('returns null when there are no active variants', () => {
    expect(pickDefaultVariant([variant({ isActive: false })])).toBeNull();
    expect(pickDefaultVariant([])).toBeNull();
  });
});

describe('toFirestoreProductDoc', () => {
  it('converts the default variant price/mrp to paise and nets stock against reserved', () => {
    const doc = toFirestoreProductDoc(
      product({ variants: [variant({ sku: 'X', mrp: '199.50', price: '149.00', stock: 30, reserved: 5, isDefault: true })] }),
    );
    expect(doc.defaultVariant).toEqual({
      sku: 'X',
      unitLabel: '500 g',
      mrpPaise: 19950,
      pricePaise: 14900,
      stock: 25,
    });
  });

  it('computes minPricePaise/maxPricePaise across active variants', () => {
    const doc = toFirestoreProductDoc(
      product({
        variants: [
          variant({ sku: 'A', price: '50.00' }),
          variant({ sku: 'B', price: '150.00' }),
          variant({ sku: 'C', price: '90.00' }),
        ],
      }),
    );
    expect(doc.minPricePaise).toBe(5000);
    expect(doc.maxPricePaise).toBe(15000);
  });

  it('excludes inactive variants from the price range', () => {
    const doc = toFirestoreProductDoc(
      product({
        variants: [variant({ sku: 'A', price: '999.00', isActive: false }), variant({ sku: 'B', price: '50.00' })],
      }),
    );
    expect(doc.minPricePaise).toBe(5000);
    expect(doc.maxPricePaise).toBe(5000);
  });

  it('is null defaultVariant and 0 price range when there are no active variants', () => {
    const doc = toFirestoreProductDoc(product({ variants: [variant({ isActive: false })] }));
    expect(doc.defaultVariant).toBeNull();
    expect(doc.minPricePaise).toBe(0);
    expect(doc.maxPricePaise).toBe(0);
  });

  it('maps categorySlug/categoryName to categoryId/categoryName', () => {
    const doc = toFirestoreProductDoc(product({ categorySlug: 'dry-fruits', categoryName: 'Dry Fruits' }));
    expect(doc.categoryId).toBe('dry-fruits');
    expect(doc.categoryName).toBe('Dry Fruits');
  });

  it('converts gstRate/ratingAvg strings to numbers', () => {
    const doc = toFirestoreProductDoc(product({ gstRate: '12.00', ratingAvg: '3.75' }));
    expect(doc.gstRatePercent).toBe(12);
    expect(doc.ratingAvg).toBe(3.75);
  });

  it('carries isFeatured/isBestSeller through unchanged (no invented isTrending field)', () => {
    const doc = toFirestoreProductDoc(product({ isFeatured: true, isBestSeller: true }));
    expect(doc.isFeatured).toBe(true);
    expect(doc.isBestSeller).toBe(true);
    expect(doc).not.toHaveProperty('isTrending');
    expect(doc).not.toHaveProperty('trending');
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
