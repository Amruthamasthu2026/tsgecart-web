import { describe, it, expect } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import { validateCoupon } from '../../src/coupons/coupons.function';

function fakeRequest(auth: { uid: string; token: Record<string, unknown> } | undefined, data?: unknown): CallableRequest {
  return { data, auth } as unknown as CallableRequest;
}

describe('validateCoupon', () => {
  it('rejects an unauthenticated caller', async () => {
    await expect(validateCoupon.run(fakeRequest(undefined, { code: 'SAVE10', subtotalPaise: 10_000 }))).rejects.toBeInstanceOf(
      HttpsError,
    );
  });

  it('rejects a missing code with invalid-argument', async () => {
    try {
      await validateCoupon.run(fakeRequest({ uid: 'u1', token: {} }, { subtotalPaise: 10_000 }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });

  it('rejects a non-positive subtotalPaise with invalid-argument', async () => {
    try {
      await validateCoupon.run(fakeRequest({ uid: 'u1', token: {} }, { code: 'SAVE10', subtotalPaise: 0 }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });

});
