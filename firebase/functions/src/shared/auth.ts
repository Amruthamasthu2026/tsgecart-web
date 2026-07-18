import type { CallableRequest } from 'firebase-functions/v2/https';
import { UnauthorizedError, ForbiddenError } from './errors';

/**
 * Auth/RBAC helpers for Callable Functions, mirroring the Express backend's
 * `authenticate` + `requireRole` + `requirePermission` middleware chain
 * (see docs/firebase-migration-audit.md §7, §31).
 *
 * No Callable Function in this repository uses these yet — Phase 1 ships
 * only the public health check. These are provided now so Phase 2+ (auth
 * migration) has a settled, reviewed pattern to build every subsequent
 * Callable Function against, rather than inventing per-function ad hoc
 * checks. Authority is exclusively the caller's Firebase custom claims
 * (`request.auth.token.role` / `.permissions`) — never a Firestore document
 * field, and never an email comparison.
 */

export type Role = 'CUSTOMER' | 'STAFF' | 'ADMIN';

export interface AuthenticatedCaller {
  uid: string;
  email: string | null;
  role: Role;
  permissions: string[];
}

/**
 * Verifies the request carries a signed-in Firebase user and returns a
 * typed view of their identity + custom claims. Throws UnauthorizedError
 * (mapped to `HttpsError('unauthenticated', ...)`) if not signed in.
 */
export function requireAuthenticatedCaller(request: CallableRequest): AuthenticatedCaller {
  if (!request.auth) {
    throw new UnauthorizedError('Sign in required');
  }
  const token = request.auth.token as Record<string, unknown>;
  const role = (token.role as Role | undefined) ?? 'CUSTOMER';
  const permissions = Array.isArray(token.permissions) ? (token.permissions as string[]) : [];

  return {
    uid: request.auth.uid,
    email: (token.email as string | undefined) ?? null,
    role,
    permissions,
  };
}

/** Throws ForbiddenError unless the caller holds one of the given roles. */
export function requireRole(request: CallableRequest, ...roles: Role[]): AuthenticatedCaller {
  const caller = requireAuthenticatedCaller(request);
  if (!roles.includes(caller.role)) {
    throw new ForbiddenError(`Requires one of: ${roles.join(', ')}`);
  }
  return caller;
}

/**
 * Throws ForbiddenError unless the caller holds the given permission key.
 * ADMIN implicitly holds every permission, matching the backend's
 * `requirePermission` behavior exactly (audit §7).
 */
export function requirePermission(request: CallableRequest, permission: string): AuthenticatedCaller {
  const caller = requireAuthenticatedCaller(request);
  if (caller.role === 'ADMIN') return caller;
  if (caller.role !== 'STAFF' || !caller.permissions.includes(permission)) {
    throw new ForbiddenError(`Missing permission: ${permission}`);
  }
  return caller;
}
