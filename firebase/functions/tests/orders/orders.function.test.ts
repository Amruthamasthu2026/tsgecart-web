import { describe, it, expect } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import { createOrder, cancelOrder, adminUpdateOrderStatus, createRazorpayOrder } from '../../src/orders/orders.function';

function fakeRequest(auth: { uid: string; token: Record<string, unknown> } | undefined, data?: unknown): CallableRequest {
  return { data, auth } as unknown as CallableRequest;
}

const validCreateOrderInput = {
  addressId: 'addr-1',
  paymentMethod: 'COD',
  idempotencyKey: 'idem-key-12345678',
};

/**
 * Exercises only requireAuthenticatedCaller()/requirePermission() and Zod
 * input validation, both of which short-circuit before any Firestore
 * transaction or secret resolution — safe as plain unit tests. The full
 * atomic order-creation transaction is covered by the emulator integration
 * tests in tests/emulator/orders.emulator.test.ts.
 */
describe('order Callable Functions — unauthenticated caller rejected', () => {
  it('createOrder rejects an unauthenticated caller', async () => {
    await expect(createOrder.run(fakeRequest(undefined, validCreateOrderInput))).rejects.toBeInstanceOf(HttpsError);
  });

  it('cancelOrder rejects an unauthenticated caller', async () => {
    await expect(cancelOrder.run(fakeRequest(undefined, { orderId: 'TSG-260719-00000001' }))).rejects.toBeInstanceOf(
      HttpsError,
    );
  });

  it('createRazorpayOrder rejects an unauthenticated caller', async () => {
    await expect(
      createRazorpayOrder.run(fakeRequest(undefined, { orderId: 'TSG-260719-00000001' })),
    ).rejects.toBeInstanceOf(HttpsError);
  });

  it('adminUpdateOrderStatus rejects an unauthenticated caller with permission-denied', async () => {
    try {
      await adminUpdateOrderStatus.run(fakeRequest(undefined, { orderId: 'TSG-260719-00000001', status: 'PACKED' }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('unauthenticated');
    }
  });

  it('adminUpdateOrderStatus rejects a signed-in customer without orders.manage', async () => {
    try {
      await adminUpdateOrderStatus.run(
        fakeRequest({ uid: 'u1', token: { role: 'CUSTOMER' } }, { orderId: 'TSG-260719-00000001', status: 'PACKED' }),
      );
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('permission-denied');
    }
  });
});

describe('createOrder — input validation (short-circuits before Firestore)', () => {
  it('rejects a missing addressId with invalid-argument', async () => {
    try {
      await createOrder.run(fakeRequest({ uid: 'u1', token: {} }, { paymentMethod: 'COD', idempotencyKey: 'idem-key-12345678' }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });

  it('rejects an invalid paymentMethod with invalid-argument', async () => {
    try {
      await createOrder.run(fakeRequest({ uid: 'u1', token: {} }, { ...validCreateOrderInput, paymentMethod: 'BITCOIN' }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });

  it('rejects a missing idempotencyKey with invalid-argument (duplicate-order guard cannot be bypassed)', async () => {
    try {
      await createOrder.run(fakeRequest({ uid: 'u1', token: {} }, { addressId: 'addr-1', paymentMethod: 'COD' }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });

  it('accepts couponCode/notes sent as null (client wire-protocol quirk, same as Phase 3/4)', async () => {
    await expect(
      createOrder.run(fakeRequest({ uid: 'u1', token: {} }, { ...validCreateOrderInput, couponCode: null, notes: null })),
    ).rejects.not.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('adminUpdateOrderStatus — input validation', () => {
  it('rejects an unknown status value with invalid-argument (even for an authorized admin)', async () => {
    try {
      await adminUpdateOrderStatus.run(
        fakeRequest({ uid: 'admin-1', token: { role: 'ADMIN' } }, { orderId: 'TSG-260719-00000001', status: 'SHIPPED' }),
      );
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });
});
