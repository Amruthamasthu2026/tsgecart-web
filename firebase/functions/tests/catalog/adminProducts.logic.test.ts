import { describe, it, expect } from 'vitest';
import {
  slugify,
  slugCandidate,
  ensureSingleDefaultVariant,
  computeMinMaxPricePaise,
  computeDefaultVariantSnapshot,
  type AdminVariantInput,
} from '../../src/catalog/adminProducts.logic';

describe('slugify', () => {
  it('lowercases, trims, and hyphenates non-alphanumeric runs', () => {
    expect(slugify('Premium Almonds!')).toBe('premium-almonds');
  });

  it('strips leading/trailing hyphens', () => {
    expect(slugify('  --Fresh Mangoes--  ')).toBe('fresh-mangoes');
  });

  it('caps length at 160 characters', () => {
    expect(slugify('a'.repeat(300)).length).toBeLessThanOrEqual(160);
  });
});

describe('slugCandidate', () => {
  it('returns the base slug unchanged on the first attempt', () => {
    expect(slugCandidate('almonds', 1)).toBe('almonds');
  });

  it('appends -N for subsequent attempts', () => {
    expect(slugCandidate('almonds', 2)).toBe('almonds-2');
    expect(slugCandidate('almonds', 3)).toBe('almonds-3');
  });
});

function variant(overrides: Partial<AdminVariantInput> = {}): AdminVariantInput {
  return {
    sku: 'ALM-500',
    unitLabel: '500 g',
    mrpPaise: 64900,
    pricePaise: 54900,
    weightGrams: 500,
    isActive: true,
    isDefault: false,
    stock: 20,
    lowStockThreshold: 5,
    ...overrides,
  };
}

describe('ensureSingleDefaultVariant', () => {
  it('makes the first variant default when none is marked', () => {
    const result = ensureSingleDefaultVariant([variant({ sku: 'A' }), variant({ sku: 'B' })]);
    expect(result.find((v) => v.sku === 'A')?.isDefault).toBe(true);
    expect(result.find((v) => v.sku === 'B')?.isDefault).toBe(false);
  });

  it('keeps only the FIRST variant marked default when multiple are marked', () => {
    const result = ensureSingleDefaultVariant([
      variant({ sku: 'A', isDefault: true }),
      variant({ sku: 'B', isDefault: true }),
    ]);
    expect(result.find((v) => v.sku === 'A')?.isDefault).toBe(true);
    expect(result.find((v) => v.sku === 'B')?.isDefault).toBe(false);
  });

  it('leaves a single correctly-marked default variant unchanged', () => {
    const result = ensureSingleDefaultVariant([variant({ sku: 'A' }), variant({ sku: 'B', isDefault: true })]);
    expect(result.find((v) => v.sku === 'B')?.isDefault).toBe(true);
    expect(result.find((v) => v.sku === 'A')?.isDefault).toBe(false);
  });
});

describe('computeMinMaxPricePaise', () => {
  it('finds the min and max price across variants', () => {
    const result = computeMinMaxPricePaise([variant({ pricePaise: 10000 }), variant({ pricePaise: 30000 }), variant({ pricePaise: 20000 })]);
    expect(result).toEqual({ minPricePaise: 10000, maxPricePaise: 30000 });
  });

  it('handles a single variant', () => {
    expect(computeMinMaxPricePaise([variant({ pricePaise: 5000 })])).toEqual({ minPricePaise: 5000, maxPricePaise: 5000 });
  });
});

describe('computeDefaultVariantSnapshot', () => {
  it('snapshots the variant marked default', () => {
    const result = computeDefaultVariantSnapshot([variant({ sku: 'A' }), variant({ sku: 'B', isDefault: true, pricePaise: 999 })]);
    expect(result?.sku).toBe('B');
    expect(result?.pricePaise).toBe(999);
  });

  it('falls back to the first variant when none is marked default', () => {
    const result = computeDefaultVariantSnapshot([variant({ sku: 'A' }), variant({ sku: 'B' })]);
    expect(result?.sku).toBe('A');
  });

  it('returns null for an empty variant list', () => {
    expect(computeDefaultVariantSnapshot([])).toBeNull();
  });
});
