export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Mirrors `backend/src/shared/apiResponse.ts`'s `buildPaginationMeta` exactly
 * (same field names/shape) so the frontend's Firestore-backed adapter can
 * hand this straight to code that already consumes the Express API's
 * pagination envelope.
 */
export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
