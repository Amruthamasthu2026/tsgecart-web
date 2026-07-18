import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { auth as adminAuth } from '../config/firebaseAdmin';
import { requireRole, type Role } from '../shared/auth';
import { parseInput } from '../shared/validation';
import { AppError, NotFoundError } from '../shared/errors';
import { logger } from '../shared/logger';

/**
 * Admin role management utility (objective 8). ADMIN-only Callable Function
 * that assigns a role + permission set to an existing Firebase Auth user via
 * custom claims — the sole source of role authority for both these
 * Functions and firestore.rules (see docs/firebase-migration-audit.md §21.2,
 * §31). There is no email allowlist and no client-supplied "isAdmin" flag
 * anywhere in this path; only an already-ADMIN caller can reach it.
 */

const ASSIGNABLE_ROLES = ['CUSTOMER', 'STAFF', 'ADMIN', 'DELIVERY_PARTNER'] as const;

export const setUserRoleSchema = z.object({
  uid: z.string().min(1, 'uid is required'),
  role: z.enum(ASSIGNABLE_ROLES),
  permissions: z.array(z.string()).default([]),
});

export type SetUserRoleInput = z.output<typeof setUserRoleSchema>;

export interface SetUserRoleResult {
  uid: string;
  role: Role;
  permissions: string[];
}

export interface SetUserRoleDeps {
  getUser: (uid: string) => Promise<{ uid: string }>;
  setCustomUserClaims: (uid: string, claims: Record<string, unknown>) => Promise<void>;
  revokeRefreshTokens: (uid: string) => Promise<void>;
}

/**
 * Core logic, decoupled from the Admin SDK via an injected `deps` object so
 * it can be unit-tested with fakes — no emulator required — mirroring the
 * "pure function + thin wrapper" pattern used throughout this codebase
 * (health.function.ts, backend/.../pincodeImport.ts).
 */
export async function applyUserRole(
  input: SetUserRoleInput,
  deps: SetUserRoleDeps,
): Promise<SetUserRoleResult> {
  const target = await deps.getUser(input.uid).catch(() => null);
  if (!target) {
    throw new NotFoundError(`No Firebase Auth user with uid ${input.uid}`);
  }

  const claims = { role: input.role, permissions: input.permissions };
  await deps.setCustomUserClaims(input.uid, claims);

  // Force the target's existing sessions to re-authenticate so the new role
  // takes effect immediately rather than waiting out their current ID
  // token's natural expiry — a stale-privileged (or stale-deprivileged)
  // token must not remain usable after an explicit role change.
  await deps.revokeRefreshTokens(input.uid);

  logger.info('Role assigned', { uid: input.uid, role: input.role });

  return { uid: input.uid, role: input.role, permissions: input.permissions };
}

export const setUserRole = onCall(async (request: CallableRequest) => {
  try {
    requireRole(request, 'ADMIN');
    const input = parseInput<SetUserRoleInput>(setUserRoleSchema, request.data);
    return await applyUserRole(input, {
      getUser: (uid) => adminAuth.getUser(uid),
      setCustomUserClaims: (uid, claims) => adminAuth.setCustomUserClaims(uid, claims),
      revokeRefreshTokens: (uid) => adminAuth.revokeRefreshTokens(uid),
    });
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});
