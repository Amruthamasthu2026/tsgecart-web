import { describe, it, expect } from 'vitest';
import { buildProductsQueryPlan, pickTrendingList, type GetProductsInput } from '../../src/catalog/catalog.queries';

function input(overrides: Partial<GetProductsInput> = {}): GetProductsInput {
  return { sort: 'createdAt', order: 'desc', page: 1, limit: 24, ...overrides };
}

describe('buildProductsQueryPlan', () => {
  it('maps sort=price to the denormalized minPricePaise field', () => {
    expect(buildProductsQueryPlan(input({ sort: 'price', order: 'asc' })).orderByField).toBe('minPricePaise');
  });

  it('maps sort=createdAt/name/ratingAvg straight through', () => {
    expect(buildProductsQueryPlan(input({ sort: 'createdAt' })).orderByField).toBe('createdAt');
    expect(buildProductsQueryPlan(input({ sort: 'name' })).orderByField).toBe('name');
    expect(buildProductsQueryPlan(input({ sort: 'ratingAvg' })).orderByField).toBe('ratingAvg');
  });

  it('computes offset from page and limit', () => {
    expect(buildProductsQueryPlan(input({ page: 1, limit: 24 })).offset).toBe(0);
    expect(buildProductsQueryPlan(input({ page: 3, limit: 24 })).offset).toBe(48);
  });

  it('carries categorySlug/featured/bestSeller through unchanged', () => {
    const plan = buildProductsQueryPlan(
      input({ categorySlug: 'fruits-vegetables', featured: true, bestSeller: false }),
    );
    expect(plan.categorySlug).toBe('fruits-vegetables');
    expect(plan.featured).toBe(true);
    expect(plan.bestSeller).toBe(false);
  });

  it('carries search through as namePrefix', () => {
    expect(buildProductsQueryPlan(input({ search: 'Almond' })).namePrefix).toBe('Almond');
  });

  it('leaves namePrefix undefined when no search is given', () => {
    expect(buildProductsQueryPlan(input()).namePrefix).toBeUndefined();
  });
});

describe('pickTrendingList', () => {
  it('prefers bestSellers when non-empty', () => {
    expect(pickTrendingList(['bs1'], ['f1'], ['l1'])).toEqual(['bs1']);
  });

  it('falls back to featured when bestSellers is empty', () => {
    expect(pickTrendingList([], ['f1', 'f2'], ['l1'])).toEqual(['f1', 'f2']);
  });

  it('falls back to latest when both bestSellers and featured are empty', () => {
    expect(pickTrendingList([], [], ['l1', 'l2'])).toEqual(['l1', 'l2']);
  });

  it('returns an empty array when everything is empty', () => {
    expect(pickTrendingList([], [], [])).toEqual([]);
  });
});
