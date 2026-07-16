import { z } from 'zod';

/** Shared query-string schema for list endpoints: pagination, sort, search. */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export function getSkipTake(page: number, limit: number): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}

/**
 * Builds a Prisma orderBy object, guarding against arbitrary field injection
 * by only permitting fields from the provided allowlist.
 */
export function buildOrderBy(
  sort: string | undefined,
  order: 'asc' | 'desc',
  allowed: string[],
  fallback: string,
): Record<string, 'asc' | 'desc'> {
  const field = sort && allowed.includes(sort) ? sort : fallback;
  return { [field]: order };
}
