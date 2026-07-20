import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin';
import { requirePermission } from '../shared/auth';
import { parseInput } from '../shared/validation';
import { AppError, BadRequestError } from '../shared/errors';
import { planBulkImport, type BulkItem, type ZoneRef } from './pincodeImport.logic';
import type { FirestoreDeliveryZoneDoc, FirestoreServiceablePincodeDoc } from './delivery.types';

/**
 * Admin delivery bulk-pincode-import, migration Phase 6 — ports
 * `POST /delivery/pincodes/bulk` (`delivery.bulk.service.ts`). Single
 * zone/pincode CRUD needs no Function at all — `deliveryZones`/
 * `serviceablePincodes` are already direct-client-writable by STAFF/ADMIN
 * with `delivery.manage` per firestore.rules (Phase 5) — this Callable
 * exists only for the BULK case, where hundreds/thousands of writes need
 * batching beyond a single client round-trip's practicality.
 *
 * `importHyderabad`/localities are explicitly NOT ported (see the Phase 6
 * completion report) — they depend on a CSV bundled in the Express repo
 * and have no live frontend page even in the existing Express admin
 * (confirmed during Phase 6 research), so porting them would be new
 * surface area with no existing consumer, not a faithful port.
 */

const MAX_BULK_ITEMS = 5000;
const BATCH_SIZE = 400;

const bulkItemSchema = z.object({ code: z.string().min(1), zoneName: z.string().nullish().transform((v) => v ?? undefined) });

const bulkImportSchema = z.object({
  items: z.array(bulkItemSchema).min(1).max(MAX_BULK_ITEMS),
  zoneId: z.string().nullish().transform((v) => v ?? undefined),
  mode: z.enum(['skip', 'upsert']).nullish().transform((v) => v ?? 'skip'),
});

export type BulkImportInput = z.output<typeof bulkImportSchema>;

export async function adminBulkImportPincodesTx(input: BulkImportInput) {
  const [zonesSnap, existingSnap] = await Promise.all([
    db.collection('deliveryZones').get(),
    db.collection('serviceablePincodes').get(),
  ]);

  const zonesById = new Map<string, ZoneRef>();
  const zonesByName = new Map<string, ZoneRef>();
  for (const doc of zonesSnap.docs) {
    const data = doc.data() as FirestoreDeliveryZoneDoc;
    const ref: ZoneRef = { id: doc.id, name: data.name, isActive: data.isActive };
    zonesById.set(doc.id, ref);
    zonesByName.set(data.name.toLowerCase(), ref);
  }
  if (input.zoneId && !zonesById.has(input.zoneId)) {
    throw new BadRequestError('Selected delivery zone does not exist');
  }

  const existingCodes = new Set(existingSnap.docs.map((d) => d.id));
  const items: BulkItem[] = input.items.map((i) => ({ code: i.code, zoneName: i.zoneName }));
  const plan = planBulkImport(items, { existingCodes, zonesById, zonesByName, defaultZoneId: input.zoneId, mode: input.mode });

  const toApply = [...plan.toCreate, ...plan.toUpdate];
  let batch = db.batch();
  let opsInBatch = 0;
  const commitIfFull = async () => {
    if (opsInBatch >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  };

  for (const entry of toApply) {
    const now = FieldValue.serverTimestamp();
    const isNew = !existingCodes.has(entry.code);
    const doc: Partial<FirestoreServiceablePincodeDoc> = {
      city: 'Hyderabad',
      state: 'Telangana',
      zoneId: entry.zoneId,
      isServiceable: true,
      updatedAt: now as never,
      ...(isNew ? { createdAt: now as never } : {}),
    };
    batch.set(db.collection('serviceablePincodes').doc(entry.code), doc, { merge: true });
    opsInBatch += 1;
    await commitIfFull();
  }
  if (opsInBatch > 0) {
    await batch.commit();
  }

  return plan;
}

export const adminBulkImportPincodes = onCall(async (request: CallableRequest) => {
  try {
    requirePermission(request, 'delivery.manage');
    const input = parseInput(bulkImportSchema, request.data);
    const plan = await adminBulkImportPincodesTx(input);
    return { stats: plan.stats, invalid: plan.invalid, failed: plan.failed, duplicates: plan.duplicates, warnings: plan.warnings };
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});
