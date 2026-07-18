import type { ZodType, ZodTypeDef } from 'zod';
import { ZodError } from 'zod';
import { ValidationError } from './errors';

/**
 * Parses `data` against a Zod schema, throwing the same `ValidationError`
 * shape the Express backend's `validate()` middleware produces (see
 * `backend/src/middlewares/validate.ts`). Callable Functions have no
 * middleware chain of their own, so every function that accepts input calls
 * this explicitly as its first line — the analogous guarantee to the
 * backend's route-level `validate({ body })`.
 */
export function parseInput<T>(schema: ZodType<T, ZodTypeDef, unknown>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new ValidationError('Request validation failed', err.flatten());
    }
    throw err;
  }
}
