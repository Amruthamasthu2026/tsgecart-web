import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin';
import { requireAuthenticatedCaller } from '../shared/auth';
import { parseInput } from '../shared/validation';
import { AppError, NotFoundError } from '../shared/errors';
import type { AddressResponse, FirestoreAddressDoc } from './addresses.types';

function addressesCollection() {
  return db.collection('addresses');
}

function addressDocToResponse(
  doc: FirebaseFirestore.DocumentSnapshot | FirebaseFirestore.QueryDocumentSnapshot,
): AddressResponse {
  const data = doc.data() as FirestoreAddressDoc;
  return {
    ...data,
    id: doc.id,
    createdAt: data.createdAt.toDate().toISOString(),
    updatedAt: data.updatedAt.toDate().toISOString(),
  };
}

const nullishString = (max: number) => z.string().max(max).nullish().transform((v) => v ?? null);

const addressPayloadSchema = z.object({
  label: nullishString(40),
  type: z.enum(['HOME', 'WORK', 'OTHER']).default('HOME'),
  contactName: z.string().min(2).max(80),
  contactPhone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  line1: z.string().min(3).max(160),
  line2: nullishString(160),
  landmark: nullishString(120),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit pincode'),
  city: z.string().min(1).nullish().transform((v) => v ?? 'Hyderabad'),
  state: z.string().min(1).nullish().transform((v) => v ?? 'Telangana'),
  isDefault: z.boolean().nullish().transform((v) => v ?? false),
});

type AddressPayload = z.output<typeof addressPayloadSchema>;

/** Unsets `isDefault` on every other address this user owns, inside the given transaction. */
async function unsetOtherDefaults(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  exceptAddressId: string | null,
): Promise<void> {
  const snap = await tx.get(addressesCollection().where('userId', '==', uid).where('isDefault', '==', true));
  for (const doc of snap.docs) {
    if (doc.id === exceptAddressId) continue;
    tx.update(doc.ref, { isDefault: false, updatedAt: FieldValue.serverTimestamp() });
  }
}

export async function addAddressTx(uid: string, payload: AddressPayload): Promise<AddressResponse> {
  const newRef = addressesCollection().doc();

  await db.runTransaction(async (tx) => {
    const existingSnap = await tx.get(addressesCollection().where('userId', '==', uid));
    const isFirst = existingSnap.empty;
    const shouldBeDefault = payload.isDefault || isFirst;

    if (shouldBeDefault) {
      for (const doc of existingSnap.docs) {
        if (doc.data().isDefault) {
          tx.update(doc.ref, { isDefault: false, updatedAt: FieldValue.serverTimestamp() });
        }
      }
    }

    const now = FieldValue.serverTimestamp();
    tx.set(newRef, { ...payload, userId: uid, isDefault: shouldBeDefault, createdAt: now, updatedAt: now });
  });

  const snap = await newRef.get();
  return addressDocToResponse(snap);
}

export async function updateAddressTx(
  uid: string,
  addressId: string,
  payload: AddressPayload,
): Promise<AddressResponse> {
  const ref = addressesCollection().doc(addressId);

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (!existing.exists || (existing.data() as FirestoreAddressDoc).userId !== uid) {
      // Ownership failure and "doesn't exist" are indistinguishable to the
      // caller — matches the Express API exactly (avoids leaking existence
      // of another user's address id).
      throw new NotFoundError('Address not found');
    }

    if (payload.isDefault) {
      await unsetOtherDefaults(tx, uid, addressId);
    }

    tx.update(ref, { ...payload, updatedAt: FieldValue.serverTimestamp() });
  });

  const snap = await ref.get();
  return addressDocToResponse(snap);
}

export async function deleteAddressTx(uid: string, addressId: string): Promise<{ deleted: true }> {
  const ref = addressesCollection().doc(addressId);
  let wasDefault = false;

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (!existing.exists || (existing.data() as FirestoreAddressDoc).userId !== uid) {
      throw new NotFoundError('Address not found');
    }
    wasDefault = (existing.data() as FirestoreAddressDoc).isDefault;
    tx.delete(ref);
  });

  // Promote a replacement default — a separate, follow-up transaction, not
  // atomic with the delete above. This exactly matches the existing
  // Express behavior (`users.service.ts` `deleteAddress`: delete, then a
  // second `updateAddress` call to promote the next address) rather than
  // inventing a stricter guarantee the original app doesn't have either.
  if (wasDefault) {
    await db.runTransaction(async (tx) => {
      const remaining = await tx.get(
        addressesCollection().where('userId', '==', uid).orderBy('createdAt', 'desc').limit(1),
      );
      const next = remaining.docs[0];
      if (next) {
        tx.update(next.ref, { isDefault: true, updatedAt: FieldValue.serverTimestamp() });
      }
    });
  }

  return { deleted: true };
}

export const addAddress = onCall(async (request: CallableRequest) => {
  try {
    const caller = requireAuthenticatedCaller(request);
    const payload = parseInput(addressPayloadSchema, request.data);
    return await addAddressTx(caller.uid, payload);
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

const updateAddressSchema = addressPayloadSchema.and(z.object({ id: z.string().min(1) }));

export const updateAddress = onCall(async (request: CallableRequest) => {
  try {
    const caller = requireAuthenticatedCaller(request);
    const { id, ...payload } = parseInput(updateAddressSchema, request.data);
    return await updateAddressTx(caller.uid, id, payload);
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

const deleteAddressSchema = z.object({ id: z.string().min(1) });

export const deleteAddress = onCall(async (request: CallableRequest) => {
  try {
    const caller = requireAuthenticatedCaller(request);
    const { id } = parseInput(deleteAddressSchema, request.data);
    return await deleteAddressTx(caller.uid, id);
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});
