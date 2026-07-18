import { describe, it, expect } from 'vitest';
import { buildDefaultClaims } from '../../src/auth/onUserCreated.function';

describe('buildDefaultClaims', () => {
  it('always assigns the CUSTOMER role with no permissions', () => {
    expect(buildDefaultClaims()).toEqual({ role: 'CUSTOMER', permissions: [] });
  });

  it('is deterministic and takes no input that could be manipulated by the signing-up client', () => {
    // buildDefaultClaims() intentionally has zero parameters: there is no
    // signup payload field (email, displayName, a "role" the client sent,
    // etc.) that could ever influence the assigned role.
    expect(buildDefaultClaims.length).toBe(0);
    expect(buildDefaultClaims()).toEqual(buildDefaultClaims());
  });
});
