import { describe, it, expect } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import { addAddress, updateAddress, deleteAddress } from '../../src/addresses/addresses.function';

function fakeRequest(
  auth: { uid: string; token: Record<string, unknown> } | undefined,
  data?: unknown,
): CallableRequest {
  return { data, auth } as unknown as CallableRequest;
}

const validPayload = {
  contactName: 'Asha Rao',
  contactPhone: '9876543210',
  line1: '123 Main Street',
  pincode: '500001',
};

describe('address Callable Functions — unauthenticated caller rejected', () => {
  it('addAddress rejects an unauthenticated caller', async () => {
    await expect(addAddress.run(fakeRequest(undefined, validPayload))).rejects.toBeInstanceOf(HttpsError);
  });

  it('updateAddress rejects an unauthenticated caller', async () => {
    await expect(
      updateAddress.run(fakeRequest(undefined, { ...validPayload, id: 'addr-1' })),
    ).rejects.toBeInstanceOf(HttpsError);
  });

  it('deleteAddress rejects an unauthenticated caller', async () => {
    await expect(deleteAddress.run(fakeRequest(undefined, { id: 'addr-1' }))).rejects.toBeInstanceOf(HttpsError);
  });
});

describe('addAddress — input validation (short-circuits before Firestore)', () => {
  it('rejects an invalid phone number with invalid-argument', async () => {
    try {
      await addAddress.run(fakeRequest({ uid: 'u1', token: {} }, { ...validPayload, contactPhone: '12345' }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });

  it('rejects an invalid pincode with invalid-argument', async () => {
    try {
      await addAddress.run(fakeRequest({ uid: 'u1', token: {} }, { ...validPayload, pincode: 'ABC' }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });

  it('rejects a too-short contactName with invalid-argument', async () => {
    try {
      await addAddress.run(fakeRequest({ uid: 'u1', token: {} }, { ...validPayload, contactName: 'A' }));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });

  it('accepts optional fields sent as null (client wire-protocol quirk, same as Phase 3)', async () => {
    await expect(
      addAddress.run(
        fakeRequest(
          { uid: 'u1', token: {} },
          { ...validPayload, label: null, line2: null, landmark: null, city: null, state: null, isDefault: null },
        ),
      ),
    ).rejects.not.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('updateAddress — input validation', () => {
  it('rejects a missing id with invalid-argument', async () => {
    try {
      await updateAddress.run(fakeRequest({ uid: 'u1', token: {} }, validPayload));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });
});

describe('deleteAddress — input validation', () => {
  it('rejects a missing id with invalid-argument', async () => {
    try {
      await deleteAddress.run(fakeRequest({ uid: 'u1', token: {} }, {}));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('invalid-argument');
    }
  });
});
