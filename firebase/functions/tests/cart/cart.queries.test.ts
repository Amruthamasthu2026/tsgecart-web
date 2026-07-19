import { describe, it, expect } from 'vitest';
import { computeLineTotalPaise, computeLineTaxPaise, summarizeCart } from '../../src/cart/cart.queries';
import type { CartLineResponse } from '../../src/cart/cart.types';

function line(overrides: Partial<CartLineResponse> = {}): CartLineResponse {
  return {
    variantId: 'SKU-1',
    productId: 'prod-1',
    productSlug: 'fresh-almonds',
    productName: 'Fresh Almonds',
    image: null,
    unitLabel: '500 g',
    sku: 'SKU-1',
    pricePaise: 10000,
    mrpPaise: 12000,
    gstRatePercent: 5,
    quantity: 2,
    lineTotalPaise: 20000,
    inStock: true,
    availableStock: 10,
    ...overrides,
  };
}

describe('computeLineTotalPaise', () => {
  it('multiplies price by quantity', () => {
    expect(computeLineTotalPaise(10000, 3)).toBe(30000);
  });

  it('rounds to the nearest paisa', () => {
    expect(computeLineTotalPaise(333, 3)).toBe(999);
  });
});

describe('computeLineTaxPaise', () => {
  it('extracts the embedded GST portion from a tax-inclusive price (not added on top)', () => {
    // lineTotal=10500 at 5% GST: embedded tax = 10500 - 10500/1.05 = 500
    expect(computeLineTaxPaise(10500, 5)).toBe(500);
  });

  it('is 0 for a 0% GST line', () => {
    expect(computeLineTaxPaise(10000, 0)).toBe(0);
  });
});

describe('summarizeCart', () => {
  it('itemCount sums quantities across all lines (not line count)', () => {
    const items = [line({ quantity: 2 }), line({ quantity: 3, variantId: 'SKU-2' })];
    expect(summarizeCart(items).itemCount).toBe(5);
  });

  it('subtotalPaise sums lineTotalPaise across all lines', () => {
    const items = [line({ lineTotalPaise: 20000 }), line({ lineTotalPaise: 15000, variantId: 'SKU-2' })];
    expect(summarizeCart(items).subtotalPaise).toBe(35000);
  });

  it('taxPaise sums the embedded-tax portion of every line', () => {
    const items = [
      line({ lineTotalPaise: 10500, gstRatePercent: 5 }), // tax=500
      line({ lineTotalPaise: 11200, gstRatePercent: 12, variantId: 'SKU-2' }), // tax=1200
    ];
    expect(summarizeCart(items).taxPaise).toBe(1700);
  });

  it('returns zeros for an empty cart', () => {
    expect(summarizeCart([])).toEqual({ itemCount: 0, subtotalPaise: 0, taxPaise: 0 });
  });
});
