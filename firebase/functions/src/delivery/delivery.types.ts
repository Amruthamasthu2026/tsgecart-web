import type { Timestamp } from 'firebase-admin/firestore';

/**
 * `deliveryZones/{zoneId}` and `serviceablePincodes/{pincode}` (doc ID is
 * the pincode itself — deterministic lookup, no query needed), per
 * docs/firebase-migration-audit.md §30. Both are public-read (a pincode
 * check happens pre-auth on the checkout/product page) and
 * `delivery.manage`-write, matching the existing `products`/`categories`
 * public-read/staff-write split. Mirrors Prisma's `DeliveryZone`/`Pincode`
 * — `Locality` is not ported (Phase 4's `FirestoreAddressDoc` already
 * dropped `localityId` as an intentional simplification; nothing in this
 * phase needs a locality-level lookup).
 */
export interface FirestoreDeliveryZoneDoc {
  name: string;
  description: string | null;
  deliveryChargePaise: number;
  /** 0 = no free-delivery threshold configured (not "always free"). */
  freeDeliveryLimitPaise: number;
  minEtaMinutes: number;
  maxEtaMinutes: number;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FirestoreServiceablePincodeDoc {
  city: string;
  state: string;
  zoneId: string | null;
  isServiceable: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
