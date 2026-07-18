import { describe, it, expect } from 'vitest';
import {
  AppError,
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError,
} from '../../src/shared/errors';

describe('AppError hierarchy', () => {
  it('carries the expected status/code/functionsErrorCode per subclass', () => {
    expect(new BadRequestError()).toMatchObject({ statusCode: 400, code: 'BAD_REQUEST', functionsErrorCode: 'invalid-argument' });
    expect(new ValidationError()).toMatchObject({ statusCode: 422, code: 'VALIDATION_ERROR', functionsErrorCode: 'invalid-argument' });
    expect(new UnauthorizedError()).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', functionsErrorCode: 'unauthenticated' });
    expect(new ForbiddenError()).toMatchObject({ statusCode: 403, code: 'FORBIDDEN', functionsErrorCode: 'permission-denied' });
    expect(new NotFoundError()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND', functionsErrorCode: 'not-found' });
    expect(new ConflictError()).toMatchObject({ statusCode: 409, code: 'CONFLICT', functionsErrorCode: 'already-exists' });
    expect(new TooManyRequestsError()).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED', functionsErrorCode: 'resource-exhausted' });
  });

  it('is an instanceof Error and AppError for every subclass', () => {
    const err = new NotFoundError('missing');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.message).toBe('missing');
  });

  it('converts to an HttpsError carrying the same functionsErrorCode', () => {
    const err = new ForbiddenError('nope');
    const httpsError = err.toHttpsError();
    expect(httpsError.code).toBe('permission-denied');
    expect(httpsError.message).toBe('nope');
  });

  it('preserves details through toHttpsError', () => {
    const err = new ValidationError('bad input', { field: 'email' });
    const httpsError = err.toHttpsError();
    expect(httpsError.details).toMatchObject({ code: 'VALIDATION_ERROR', details: { field: 'email' } });
  });
});
