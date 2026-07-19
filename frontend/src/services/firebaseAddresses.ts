import { httpsCallable } from 'firebase/functions';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { firebaseFunctions, firebaseFirestore } from '../lib/firebase';
import type { Address, AddressPayload } from '../features/account/account.api';

/**
 * Firestore-backed address service — added ALONGSIDE
 * `features/account/account.api.ts`'s address methods (untouched). Reads
 * go straight to Firestore (owner-only Security Rule, no cross-document
 * invariant to protect on a read); every write goes through a Callable
 * Function (`firebase/functions/src/addresses/addresses.function.ts`)
 * because "at most one isDefault:true per user" is a cross-document
 * invariant a client cannot be trusted to enforce honestly — see
 * firestore.rules' `addresses/{addressId}` block (write: if false).
 *
 * See `VITE_USE_FIRESTORE_ADDRESSES` (frontend/.env.example).
 */

interface FirestoreAddressResponse {
  id: string;
  userId: string;
  label: string | null;
  type: 'HOME' | 'WORK' | 'OTHER';
  contactName: string;
  contactPhone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  pincode: string;
  city: string;
  state: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

const addAddressCallable = httpsCallable<AddressPayload, FirestoreAddressResponse>(firebaseFunctions, 'addAddress');
const updateAddressCallable = httpsCallable<AddressPayload & { id: string }, FirestoreAddressResponse>(
  firebaseFunctions,
  'updateAddress',
);
const deleteAddressCallable = httpsCallable<{ id: string }, { deleted: true }>(firebaseFunctions, 'deleteAddress');

function toLegacyAddress(fsAddress: FirestoreAddressResponse): Address {
  return {
    id: fsAddress.id,
    label: fsAddress.label,
    type: fsAddress.type,
    contactName: fsAddress.contactName,
    contactPhone: fsAddress.contactPhone,
    line1: fsAddress.line1,
    line2: fsAddress.line2,
    landmark: fsAddress.landmark,
    pincode: fsAddress.pincode,
    city: fsAddress.city,
    state: fsAddress.state,
    isDefault: fsAddress.isDefault,
  };
}

export const firebaseAddressesApi = {
  async listAddresses(uid: string): Promise<Address[]> {
    // Matches the Express API's exact ordering ([{isDefault:'desc'},
    // {createdAt:'desc'}]) — requires the composite index (userId,
    // isDefault desc, createdAt desc), see firebase/firestore.indexes.json.
    const snap = await getDocs(
      query(
        collection(firebaseFirestore, 'addresses'),
        where('userId', '==', uid),
        orderBy('isDefault', 'desc'),
        orderBy('createdAt', 'desc'),
      ),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<FirestoreAddressResponse, 'id'>) }))
      .map(toLegacyAddress);
  },

  async createAddress(payload: AddressPayload): Promise<Address> {
    const result = await addAddressCallable(payload);
    return toLegacyAddress(result.data);
  },

  async updateAddress(id: string, payload: AddressPayload): Promise<Address> {
    const result = await updateAddressCallable({ ...payload, id });
    return toLegacyAddress(result.data);
  },

  async deleteAddress(id: string): Promise<void> {
    await deleteAddressCallable({ id });
  },
};

/** True when address management should read/write Firestore instead of the Express API. */
export const useFirestoreAddresses = import.meta.env.VITE_USE_FIRESTORE_ADDRESSES === 'true';
