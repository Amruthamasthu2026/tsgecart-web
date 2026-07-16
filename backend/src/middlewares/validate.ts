import type { NextFunction, Request, Response } from 'express';
import type { AnyZodObject, ZodEffects } from 'zod';
import { ValidationError } from '../shared/errors.js';

type Schema = AnyZodObject | ZodEffects<AnyZodObject>;

interface ValidationSchemas {
  body?: Schema;
  query?: Schema;
  params?: Schema;
}

/**
 * Validates and coerces request parts against Zod schemas. On success the
 * parsed values replace the originals so downstream handlers receive typed,
 * sanitized input.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        Object.assign(req.query, parsed);
      }
      if (schemas.params) {
        const parsed = schemas.params.parse(req.params);
        Object.assign(req.params, parsed);
      }
      next();
    } catch (err) {
      const zodErr = err as { errors?: unknown; flatten?: () => unknown };
      const details = typeof zodErr.flatten === 'function' ? zodErr.flatten() : zodErr.errors;
      next(new ValidationError('Request validation failed', details));
    }
  };
}
