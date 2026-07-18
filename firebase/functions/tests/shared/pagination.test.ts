import { describe, it, expect } from 'vitest';
import { buildPaginationMeta } from '../../src/shared/pagination';

describe('buildPaginationMeta', () => {
  it('computes totalPages, hasNext, hasPrev for a middle page', () => {
    expect(buildPaginationMeta(2, 24, 100)).toEqual({
      page: 2,
      limit: 24,
      total: 100,
      totalPages: 5,
      hasNext: true,
      hasPrev: true,
    });
  });

  it('hasPrev is false on page 1', () => {
    expect(buildPaginationMeta(1, 24, 100).hasPrev).toBe(false);
  });

  it('hasNext is false on the last page', () => {
    expect(buildPaginationMeta(5, 24, 100).hasNext).toBe(false);
  });

  it('totalPages is 0 for an empty result set (matches backend/src/shared/apiResponse.ts exactly)', () => {
    expect(buildPaginationMeta(1, 24, 0).totalPages).toBe(0);
  });
});
