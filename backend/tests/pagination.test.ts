import { describe, it, expect } from 'vitest';
import { buildPaginationMeta } from '../src/shared/apiResponse.js';
import { getSkipTake, buildOrderBy } from '../src/shared/pagination.js';

describe('pagination helpers', () => {
  it('computes pagination meta correctly', () => {
    const meta = buildPaginationMeta(2, 20, 55);
    expect(meta).toEqual({
      page: 2,
      limit: 20,
      total: 55,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
  });

  it('handles the first page with no previous', () => {
    const meta = buildPaginationMeta(1, 10, 5);
    expect(meta.hasPrev).toBe(false);
    expect(meta.hasNext).toBe(false);
    expect(meta.totalPages).toBe(1);
  });

  it('derives skip/take from page and limit', () => {
    expect(getSkipTake(3, 20)).toEqual({ skip: 40, take: 20 });
  });

  it('only allows whitelisted sort fields', () => {
    expect(buildOrderBy('name', 'asc', ['name', 'createdAt'], 'createdAt')).toEqual({ name: 'asc' });
    expect(buildOrderBy('hacky; DROP', 'asc', ['name'], 'createdAt')).toEqual({ createdAt: 'asc' });
  });
});
