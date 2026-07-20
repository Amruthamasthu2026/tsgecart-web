/**
 * READ-ONLY MySQL → Firestore import-ready JSON export for delivery zones
 * and serviceable pincodes (Firebase migration Phase 6, ports the Prisma
 * `DeliveryZone`/`Pincode` models). Closes the gap Phase 5 explicitly
 * deferred — no export/import script existed for this pair before now;
 * zones/pincodes were previously admin-seeded directly in Firestore.
 *
 * `Locality` is intentionally NOT exported — Phase 4's
 * `FirestoreAddressDoc` already dropped `localityId` as an intentional
 * simplification, and nothing in Phase 6 needs a locality-level lookup
 * (see firebase/functions/src/delivery/delivery.types.ts).
 *
 * Read-only — never writes to MySQL, never calls Firebase, not wired into
 * any automatic npm lifecycle script.
 *
 * Usage (NOT executed as part of this migration phase):
 *   npm run --workspace backend export:firebase-delivery > backend/scripts/output/delivery-export.json
 *
 * Output feeds firebase/functions/scripts/importDeliveryToFirestore.ts.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

interface DeliveryZoneRow {
  id: string;
  name: string;
  description: string | null;
  deliveryCharge: { toString(): string };
  freeDeliveryLimit: { toString(): string };
  minEtaMinutes: number;
  maxEtaMinutes: number;
  isActive: boolean;
}

interface PincodeRow {
  code: string;
  city: string;
  state: string;
  zoneId: string | null;
  isServiceable: boolean;
}

/** Pure — no Prisma call — unit-testable on its own. */
export function toExportedDeliveryZone(row: DeliveryZoneRow): ExportedDeliveryZone {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    deliveryCharge: row.deliveryCharge.toString(),
    freeDeliveryLimit: row.freeDeliveryLimit.toString(),
    minEtaMinutes: row.minEtaMinutes,
    maxEtaMinutes: row.maxEtaMinutes,
    isActive: row.isActive,
  };
}

/** Pure — no Prisma call — unit-testable on its own. */
export function toExportedPincode(row: PincodeRow): ExportedPincode {
  return { code: row.code, city: row.city, state: row.state, zoneId: row.zoneId, isServiceable: row.isServiceable };
}

async function main(): Promise<void> {
  const [zones, pincodes] = await Promise.all([
    prisma.deliveryZone.findMany({ orderBy: { name: 'asc' } }),
    prisma.pincode.findMany({ orderBy: { code: 'asc' } }),
  ]);

  const exportedZones = zones.map((z) => toExportedDeliveryZone(z as unknown as DeliveryZoneRow));
  const exportedPincodes = pincodes.map((p) => toExportedPincode(p as unknown as PincodeRow));

  process.stdout.write(JSON.stringify({ deliveryZones: exportedZones, pincodes: exportedPincodes }, null, 2));
  process.stderr.write(
    `\nExported ${exportedZones.length} delivery zone(s) and ${exportedPincodes.length} pincode(s). MySQL was not modified (read-only).\n`,
  );
}

main()
  .catch((err: unknown) => {
    console.error('Export failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
