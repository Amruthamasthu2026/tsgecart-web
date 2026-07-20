import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import type { UserRecord } from 'firebase-admin/auth';
import { auth } from '../config/firebaseAdmin';
import { requirePermission } from '../shared/auth';
import { parseInput } from '../shared/validation';
import { AppError, NotFoundError } from '../shared/errors';
import type { AdminCustomerSummary, AdminStaffSummary } from './admin.types';

/**
 * Admin customer/staff management, migration Phase 6. Customer identity
 * lives entirely in Firebase Auth in this migration (no Firestore `users`
 * collection was ever created) — "listing customers," "activating/
 * deactivating a customer," and "listing staff with their permissions"
 * all map onto the Admin SDK's own user-management API rather than a new
 * Firestore collection, avoiding duplicate data by construction:
 * - list/search  → `auth.listUsers()`, paginated, filtered in JS by the
 *   `role` custom claim (Admin SDK has no server-side claim filter).
 * - activate/deactivate → `auth.updateUser(uid, { disabled })` — Firebase
 *   Auth's own built-in flag, the same concept as Express's `User.isActive`.
 * - role/permission assignment reuses the EXISTING `setUserRole` Callable
 *   from Phase 2 (`auth/setUserRole.function.ts`) — not reimplemented here.
 */

const MAX_LIST_PAGES = 5;

function toCustomerSummary(user: UserRecord): AdminCustomerSummary {
  return {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    isActive: !user.disabled,
    emailVerified: user.emailVerified,
    createdAt: user.metadata.creationTime ? new Date(user.metadata.creationTime).toISOString() : null,
  };
}

const listCustomersSchema = z.object({
  search: z.string().max(200).nullish().transform((v) => v ?? null),
});

/**
 * Pages through Auth users (up to `MAX_LIST_PAGES` × 1000), keeping only
 * CUSTOMER-role users, optionally filtered by a case-insensitive
 * email/display-name substring match — mirrors the Express `OR:[{name:
 * contains},{email:contains}]` search exactly, just evaluated in JS since
 * the Admin SDK has no server-side text search.
 */
export async function listCustomers(search: string | null): Promise<{ customers: AdminCustomerSummary[]; truncated: boolean }> {
  const needle = search?.trim().toLowerCase() || null;
  const customers: AdminCustomerSummary[] = [];
  let pageToken: string | undefined;
  let truncated = false;

  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const result = await auth.listUsers(1000, pageToken);
    for (const user of result.users) {
      const role = (user.customClaims as { role?: string } | undefined)?.role ?? 'CUSTOMER';
      if (role !== 'CUSTOMER') continue;
      if (needle && !(user.email?.toLowerCase().includes(needle) || user.displayName?.toLowerCase().includes(needle))) continue;
      customers.push(toCustomerSummary(user));
    }
    if (!result.pageToken) {
      return { customers, truncated: false };
    }
    pageToken = result.pageToken;
    truncated = true;
  }
  return { customers, truncated };
}

export const adminListCustomers = onCall(async (request: CallableRequest) => {
  try {
    requirePermission(request, 'customers.manage');
    const { search } = parseInput(listCustomersSchema, request.data ?? {});
    return await listCustomers(search);
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

const setCustomerActiveSchema = z.object({ uid: z.string().min(1), isActive: z.boolean() });

export const adminSetCustomerActive = onCall(async (request: CallableRequest) => {
  try {
    requirePermission(request, 'customers.manage');
    const { uid, isActive } = parseInput(setCustomerActiveSchema, request.data);
    try {
      await auth.updateUser(uid, { disabled: !isActive });
    } catch {
      throw new NotFoundError('Customer not found');
    }
    return { uid, isActive };
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

/** Lists STAFF/ADMIN users with their current role + permissions — read-only counterpart to `setUserRole`. */
export async function listStaff(): Promise<AdminStaffSummary[]> {
  const staff: AdminStaffSummary[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const result = await auth.listUsers(1000, pageToken);
    for (const user of result.users) {
      const claims = user.customClaims as { role?: string; permissions?: string[] } | undefined;
      const role = claims?.role ?? 'CUSTOMER';
      if (role !== 'STAFF' && role !== 'ADMIN') continue;
      staff.push({ uid: user.uid, email: user.email ?? null, role, permissions: claims?.permissions ?? [] });
    }
    if (!result.pageToken) break;
    pageToken = result.pageToken;
  }
  return staff;
}

export const adminListStaff = onCall(async (request: CallableRequest) => {
  try {
    requirePermission(request, 'settings.manage');
    return { staff: await listStaff() };
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});
