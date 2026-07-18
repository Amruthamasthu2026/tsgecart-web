import { describe, it, expect } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import {
  requireAuthenticatedCaller,
  requireRole,
  requirePermission,
} from '../../src/shared/auth';
import { UnauthorizedError, ForbiddenError } from '../../src/shared/errors';

function fakeRequest(
  auth: { uid: string; token: Record<string, unknown> } | undefined,
): CallableRequest {
  return { data: undefined, auth } as unknown as CallableRequest;
}

describe('requireAuthenticatedCaller', () => {
  it('throws UnauthorizedError when there is no auth context', () => {
    expect(() => requireAuthenticatedCaller(fakeRequest(undefined))).toThrow(UnauthorizedError);
  });

  it('defaults role to CUSTOMER when no role claim is present', () => {
    const caller = requireAuthenticatedCaller(fakeRequest({ uid: 'u1', token: {} }));
    expect(caller).toMatchObject({ uid: 'u1', role: 'CUSTOMER', permissions: [] });
  });

  it('reads role/permissions/email straight from custom claims', () => {
    const caller = requireAuthenticatedCaller(
      fakeRequest({ uid: 'u2', token: { role: 'STAFF', permissions: ['orders.manage'], email: 'staff@tsgecart.com' } }),
    );
    expect(caller).toEqual({ uid: 'u2', email: 'staff@tsgecart.com', role: 'STAFF', permissions: ['orders.manage'] });
  });

  it('never derives role from a document field or the email string', () => {
    // Even if a caller's email looks like an admin address, without an
    // explicit `role` custom claim they must resolve to CUSTOMER.
    const caller = requireAuthenticatedCaller(
      fakeRequest({ uid: 'u3', token: { email: 'admin@tsgecart.com' } }),
    );
    expect(caller.role).toBe('CUSTOMER');
  });
});

describe('requireRole', () => {
  it('passes when the caller holds one of the allowed roles', () => {
    const caller = requireRole(fakeRequest({ uid: 'u1', token: { role: 'ADMIN' } }), 'ADMIN', 'STAFF');
    expect(caller.role).toBe('ADMIN');
  });

  it('throws ForbiddenError when the caller role is not allowed', () => {
    expect(() =>
      requireRole(fakeRequest({ uid: 'u1', token: { role: 'CUSTOMER' } }), 'ADMIN'),
    ).toThrow(ForbiddenError);
  });
});

describe('requirePermission', () => {
  it('ADMIN implicitly holds every permission', () => {
    const caller = requirePermission(fakeRequest({ uid: 'u1', token: { role: 'ADMIN' } }), 'anything.at.all');
    expect(caller.role).toBe('ADMIN');
  });

  it('STAFF passes only with the exact permission key present', () => {
    const req = fakeRequest({ uid: 'u1', token: { role: 'STAFF', permissions: ['products.manage'] } });
    expect(() => requirePermission(req, 'products.manage')).not.toThrow();
  });

  it('STAFF without the permission key is forbidden', () => {
    const req = fakeRequest({ uid: 'u1', token: { role: 'STAFF', permissions: ['products.manage'] } });
    expect(() => requirePermission(req, 'orders.manage')).toThrow(ForbiddenError);
  });

  it('CUSTOMER is always forbidden regardless of any permissions array present', () => {
    const req = fakeRequest({ uid: 'u1', token: { role: 'CUSTOMER', permissions: ['orders.manage'] } });
    expect(() => requirePermission(req, 'orders.manage')).toThrow(ForbiddenError);
  });
});
