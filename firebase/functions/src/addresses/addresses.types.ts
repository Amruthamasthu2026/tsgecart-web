import type { Timestamp } from 'firebase-admin/firestore';

/**
 * `addresses/{addressId}` — doc ID auto-generated, per
 * docs/firebase-migration-audit.md §30. Every doc carries `userId` as a
 * top-level field (the ownership convention every user-owned collection in
 * this migration follows — Security Rules key off it, never the doc path
 * alone).
 *
 * Read is direct-client (owner-only, via firestore.rules), but every WRITE
 * goes through a Callable Function (addresses.function.ts) — not because
 * ownership can't be expressed in Rules (it can, trivially), but because
 * "at most one `isDefault: true` per user" is a cross-document invariant
 * Rules cannot safely enforce against a client racing two writes; a
 * Function centralizes it in one Firestore transaction, exactly matching
 * the existing Express behavior (`users.repository.ts`'s
 * `createAddress`/`updateAddress`, both wrapped in `prisma.$transaction`).
 */
export type AddressType = 'HOME' | 'WORK' | 'OTHER';

export interface FirestoreAddressDoc {
  userId: string;
  label: string | null;
  type: AddressType;
  contactName: string;
  contactPhone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  pincode: string;
  city: string;
  state: string;
  isDefault: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AddressResponse extends Omit<FirestoreAddressDoc, 'createdAt' | 'updatedAt'> {
  id: string;
  createdAt: string;
  updatedAt: string;
}
