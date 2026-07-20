/**
 * NOT EXECUTED AUTOMATICALLY. Imports delivery zones and serviceable
 * pincodes into Firestore from the JSON produced by
 * `backend/scripts/exportDeliveryFromMysql.ts` (Firebase migration
 * Phase 6). Closes the gap Phase 5 explicitly deferred — no
 * export/import script existed for this pair before now.
 *
 * Safe by default: dry run unless `--execute` is passed. Idempotent:
 * `deliveryZones` doc ID reuses the original MySQL `DeliveryZone.id`
 * (stable across re-runs, and lets `Pincode.zoneId` carry straight over
 * with no remapping needed); `serviceablePincodes` doc ID is the pincode
 * `code` itself, matching the existing `delivery.function.ts` bulk-import
 * convention. Every write is a deterministic `set()`.
 *
 * Usage:
 *   npx tsx scripts/importDeliveryToFirestore.ts <path-to-export.json>              # dry run (default)
 *   npx tsx scripts/importDeliveryToFirestore.ts <path-to-export.json> --execute    # real write
 */
import { readFileSync } from 'node:fs';
import { rupeesToPaise } from '../src/shared/money';
import { logger } from '../src/shared/logger';
import type { FirestoreDeliveryZoneDoc, FirestoreServiceablePincodeDoc } from '../src/delivery/delivery.types';

export interface ExportedDeliveryZone {
  id: string;
  name: string;
  description: string | null;
  deliveryCharge: string;
  freeDeliveryLimit: string;
  minEtaMinutes: number;
  maxEtaMinutes: number;
  isActive: boolean;
}

export interface ExportedPincode {
  code: string;
  city: string;
  state: string;
  zoneId: string | null;
  isServiceable: boolean;
}

export type FirestoreDeliveryZoneWrite = Omit<FirestoreDeliveryZoneDoc, 'createdAt' | 'updatedAt'>;
export type FirestoreServiceablePincodeWrite = Omit<FirestoreServiceablePincodeDoc, 'createdAt' | 'updatedAt'>;

/** Pure — no Admin SDK, no file I/O — unit-testable on its own. */
export function toFirestoreDeliveryZoneDoc(zone: ExportedDeliveryZone): FirestoreDeliveryZoneWrite {
  return {
    name: zone.name,
    description: zone.description,
    deliveryChargePaise: rupeesToPaise(zone.deliveryCharge),
    freeDeliveryLimitPaise: rupeesToPaise(zone.freeDeliveryLimit),
    minEtaMinutes: zone.minEtaMinutes,
    maxEtaMinutes: zone.maxEtaMinutes,
    isActive: zone.isActive,
  };
}

/** Pure — no Admin SDK, no file I/O — unit-testable on its own. */
export function toFirestoreServiceablePincodeDoc(pincode: ExportedPincode): FirestoreServiceablePincodeWrite {
  return { city: pincode.city, state: pincode.state, zoneId: pincode.zoneId, isServiceable: pincode.isServiceable };
}

export interface ParsedArgs {
  filePath: string;
  execute: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const execute = argv.includes('--execute');
  const filePath = argv.find((a) => !a.startsWith('--'));
  if (!filePath) {
    throw new Error('Usage: importDeliveryToFirestore.ts <path-to-export.json> [--execute]');
  }
  return { filePath, execute };
}

async function main(): Promise<void> {
  const { filePath, execute } = parseArgs(process.argv.slice(2));
  const raw = readFileSync(filePath, 'utf8');
  const { deliveryZones, pincodes } = JSON.parse(raw) as { deliveryZones: ExportedDeliveryZone[]; pincodes: ExportedPincode[] };

  logger.info('Loaded delivery import records', { zones: deliveryZones.length, pincodes: pincodes.length });
  console.log(`Loaded ${deliveryZones.length} delivery zone(s) and ${pincodes.length} pincode(s) from ${filePath}.`);

  if (!execute) {
    console.log('\nDRY RUN — nothing was written to Firestore. Re-run with --execute to perform the real import.');
    return;
  }

  const { db } = await import('../src/config/firebaseAdmin');
  const { FieldValue } = await import('firebase-admin/firestore');

  console.log('\nEXECUTING real Firestore writes...');
  let batch = db.batch();
  let opsInBatch = 0;
  const commitIfFull = async () => {
    if (opsInBatch >= 400) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  };

  for (const zone of deliveryZones) {
    const zoneDoc = toFirestoreDeliveryZoneDoc(zone);
    const now = FieldValue.serverTimestamp();
    batch.set(db.collection('deliveryZones').doc(zone.id), { ...zoneDoc, createdAt: now, updatedAt: now });
    opsInBatch += 1;
    await commitIfFull();
  }

  for (const pincode of pincodes) {
    const pincodeDoc = toFirestoreServiceablePincodeDoc(pincode);
    const now = FieldValue.serverTimestamp();
    batch.set(db.collection('serviceablePincodes').doc(pincode.code), { ...pincodeDoc, createdAt: now, updatedAt: now });
    opsInBatch += 1;
    await commitIfFull();
  }
  if (opsInBatch > 0) {
    await batch.commit();
  }

  logger.info('Firestore delivery import complete', { zones: deliveryZones.length, pincodes: pincodes.length });
  console.log(`Wrote ${deliveryZones.length} delivery zone(s) and ${pincodes.length} pincode(s).`);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('Import failed:', err);
    process.exitCode = 1;
  });
}
