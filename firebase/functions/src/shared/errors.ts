import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';

/**
 * Application error hierarchy for Cloud Functions, mirroring the shape of
 * the existing Express backend's `shared/errors.ts` (same operational-error
 * philosophy: every thrown error carries an HTTP-equivalent status/code and
 * a safe, user-facing message).
 *
 * Two call shapes are supported because this codebase will have both
 * Callable Functions (which must throw `HttpsError`) and HTTPS Functions
 * (which shape their own JSON response, matching the existing REST envelope
 * `{ success: false, error: { code, message } }`). `AppError.toHttpsError()`
 * and `sendErrorResponse()` (in `apiResponse.ts`-equivalent, added when the
 * first HTTPS function needs it) bridge the two.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly functionsErrorCode: FunctionsErrorCode;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    functionsErrorCode: FunctionsErrorCode = 'internal',
    details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.functionsErrorCode = functionsErrorCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  /** Converts to the error type Callable Functions are required to throw. */
  toHttpsError(): HttpsError {
    return new HttpsError(this.functionsErrorCode, this.message, {
      code: this.code,
      details: this.details,
    });
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown) {
    super(message, 400, 'BAD_REQUEST', 'invalid-argument', details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 422, 'VALIDATION_ERROR', 'invalid-argument', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED', 'unauthenticated');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403, 'FORBIDDEN', 'permission-denied');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND', 'not-found');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details?: unknown) {
    super(message, 409, 'CONFLICT', 'already-exists', details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMITED', 'resource-exhausted');
  }
}
