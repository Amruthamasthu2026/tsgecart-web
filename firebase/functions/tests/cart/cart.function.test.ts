import { describe, it, expect } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import { getCart, addCartItem, updateCartItemQuantity, removeCartItem, clearCart } from '../../src/cart/cart.function';

function fakeRequest(
  auth: { uid: string; token: Record<string, unknown> } | undefined,
  data?: unknown,
): CallableRequest {
  return { data, auth } as unknown as CallableRequest;
}

/**
 * These exercise only the requireAuthenticatedCaller() guard and Zod input
 * validation, both of which short-circuit before any Firestore call — safe
 * to run as plain unit tests. Full transactional behavior (reservation,
 * stock checks, totals) is covered by the real emulator integration tests
 * in tests/emulator/cart.emulator.test.ts.
 */
describe('cart Callable Functions — unauthenticated caller rejected', () => {
  it('getCart rejects an unauthenticated caller', async () => {
    await expect(getCart.run(fakeRequest(undefined))).rejects.toBeInstanceOf(HttpsError);
  });

  it('addCartItem rejects an unauthenticated caller', async () => {
    await expect(
      addCartItem.run(fakeRequest(undefined, { variantId: 'SKU-1', quantity: 1 })),
    ).rejects.toBeInstanceOf(HttpsError);
  });

  it('updateCartItemQuantity rejects an unauthenticated caller', async () => {
    await expect(
      updateCartItemQuantity.run(fakeRequest(undefined, { variantId: 'SKU-1', quantity: 2 })),
    ).rejects.toBeInstanceOf(HttpsError);
  });

  it('removeCartItem rejects an unauthenticated caller', async () => {
    await expect(removeCartItem.run(fakeRequest(undefined, { variantId: 'SKU-1' }))).rejects.toBeInstanceOf(
      HttpsError,
    );
  });

  it('clearCart rejects an unauthenticated caller', async () => {
    await expect(clearCart.run(fakeRequest(undefined))).rejects.toBeInstanceOf(HttpsError);
  });
});

describe('addCartItem — input validation (short-circuits before Firestore)', () => {
  it('rejects a quantity above MAX_QTY_PER_ITEM with invalid-argument', async () => {
    try {
      await addCartItem.run(fakeRequest({ uid: 'u1', token: {} }, { variantId: 'SKU-1', quantity: 999 }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });

  it('rejects a missing variantId with invalid-argument', async () => {
    try {
      await addCartItem.run(fakeRequest({ uid: 'u1', token: {} }, { quantity: 1 }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });

  it('does not reject when quantity is omitted (defaults to 1) — fails later only on the Firestore call', async () => {
    // A quantity-omitted call must pass validation and reach the Firestore
    // layer, not fail as invalid-argument (regression coverage for the
    // same null-vs-undefined wire-protocol quirk fixed in Phase 3).
    await expect(
      addCartItem.run(fakeRequest({ uid: 'u1', token: {} }, { variantId: 'SKU-1', quantity: null })),
    ).rejects.not.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('updateCartItemQuantity — input validation', () => {
  it('accepts quantity: 0 (remove) without invalid-argument', async () => {
    await expect(
      updateCartItemQuantity.run(fakeRequest({ uid: 'u1', token: {} }, { variantId: 'SKU-1', quantity: 0 })),
    ).rejects.not.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects a negative quantity with invalid-argument', async () => {
    try {
      await updateCartItemQuantity.run(fakeRequest({ uid: 'u1', token: {} }, { variantId: 'SKU-1', quantity: -1 }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });
});
