import { describe, it, expect, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  applyUserRole,
  setUserRole,
  setUserRoleSchema,
  type SetUserRoleDeps,
} from '../../src/auth/setUserRole.function';
import { NotFoundError } from '../../src/shared/errors';
import { parseInput } from '../../src/shared/validation';
import { ValidationError } from '../../src/shared/errors';

function fakeRequest(
  auth: { uid: string; token: Record<string, unknown> } | undefined,
  data?: unknown,
): CallableRequest {
  return { data, auth } as unknown as CallableRequest;
}

function fakeDeps(overrides: Partial<SetUserRoleDeps> = {}): SetUserRoleDeps {
  return {
    getUser: vi.fn(async (uid: string) => ({ uid })),
    setCustomUserClaims: vi.fn(async () => undefined),
    revokeRefreshTokens: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('setUserRoleSchema', () => {
  it('accepts every documented role', () => {
    for (const role of ['CUSTOMER', 'STAFF', 'ADMIN', 'DELIVERY_PARTNER'] as const) {
      expect(() => parseInput(setUserRoleSchema, { uid: 'u1', role })).not.toThrow();
    }
  });

  it('defaults permissions to an empty array', () => {
    const parsed = parseInput(setUserRoleSchema, { uid: 'u1', role: 'STAFF' });
    expect(parsed.permissions).toEqual([]);
  });

  it('rejects an unknown role string', () => {
    expect(() => parseInput(setUserRoleSchema, { uid: 'u1', role: 'SUPERUSER' })).toThrow(ValidationError);
  });

  it('rejects a missing uid', () => {
    expect(() => parseInput(setUserRoleSchema, { role: 'ADMIN' })).toThrow(ValidationError);
  });
});

describe('applyUserRole', () => {
  it('sets custom claims from the validated role + permissions', async () => {
    const deps = fakeDeps();
    const result = await applyUserRole(
      { uid: 'u1', role: 'STAFF', permissions: ['orders.manage'] },
      deps,
    );

    expect(deps.setCustomUserClaims).toHaveBeenCalledWith('u1', {
      role: 'STAFF',
      permissions: ['orders.manage'],
    });
    expect(result).toEqual({ uid: 'u1', role: 'STAFF', permissions: ['orders.manage'] });
  });

  it('revokes the target user refresh tokens so the change takes effect immediately', async () => {
    const deps = fakeDeps();
    await applyUserRole({ uid: 'u1', role: 'ADMIN', permissions: [] }, deps);
    expect(deps.revokeRefreshTokens).toHaveBeenCalledWith('u1');
  });

  it('revokes tokens only after claims are set (ordering matters for consistency)', async () => {
    const calls: string[] = [];
    const deps = fakeDeps({
      setCustomUserClaims: vi.fn(async () => {
        calls.push('setCustomUserClaims');
      }),
      revokeRefreshTokens: vi.fn(async () => {
        calls.push('revokeRefreshTokens');
      }),
    });
    await applyUserRole({ uid: 'u1', role: 'ADMIN', permissions: [] }, deps);
    expect(calls).toEqual(['setCustomUserClaims', 'revokeRefreshTokens']);
  });

  it('throws NotFoundError when the target uid does not exist in Firebase Auth', async () => {
    const deps = fakeDeps({
      getUser: vi.fn(async () => {
        throw new Error('no user record');
      }),
    });
    await expect(applyUserRole({ uid: 'ghost', role: 'ADMIN', permissions: [] }, deps)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(deps.setCustomUserClaims).not.toHaveBeenCalled();
    expect(deps.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('assigns DELIVERY_PARTNER role correctly', async () => {
    const deps = fakeDeps();
    const result = await applyUserRole({ uid: 'u2', role: 'DELIVERY_PARTNER', permissions: [] }, deps);
    expect(result.role).toBe('DELIVERY_PARTNER');
  });
});

describe('setUserRole Callable wrapper — ADMIN guard', () => {
  // These short-circuit inside requireRole(), before any Admin SDK call is
  // reached, so they are safe to run as plain (non-emulator) unit tests via
  // the real onCall-wrapped function's `.run()` method.

  it('rejects an unauthenticated caller with an HttpsError (not a raw AppError)', async () => {
    await expect(setUserRole.run(fakeRequest(undefined, { uid: 'u1', role: 'ADMIN' }))).rejects.toBeInstanceOf(
      HttpsError,
    );
  });

  it('rejects a signed-in non-ADMIN caller with permission-denied', async () => {
    try {
      await setUserRole.run(
        fakeRequest({ uid: 'caller-1', token: { role: 'CUSTOMER' } }, { uid: 'u1', role: 'ADMIN' }),
      );
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('permission-denied');
    }
  });

  it('rejects invalid input (bad role enum) with invalid-argument, even for an ADMIN caller', async () => {
    try {
      await setUserRole.run(
        fakeRequest({ uid: 'admin-1', token: { role: 'ADMIN' } }, { uid: 'u1', role: 'SUPERUSER' }),
      );
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });
});
