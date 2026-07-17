import { prisma } from '../../config/prisma.js';
import { deliveryService } from './delivery.service.js';
import { loadHyderabadPincodes } from '../../shared/pincodeData.js';
import { BadRequestError } from '../../shared/errors.js';
import {
  planBulkImport,
  PINCODE_RE,
  type BulkItem,
  type BulkPlan,
  type ZoneRef,
} from './pincodeImport.js';

async function loadZoneMaps(): Promise<{ byId: Map<string, ZoneRef>; byName: Map<string, ZoneRef> }> {
  const zones = await prisma.deliveryZone.findMany({
    select: { id: true, name: true, isActive: true },
  });
  const byId = new Map<string, ZoneRef>();
  const byName = new Map<string, ZoneRef>();
  for (const z of zones) {
    byId.set(z.id, z);
    byName.set(z.name.toLowerCase(), z);
  }
  return { byId, byName };
}

async function invalidateCaches(codes: string[]): Promise<void> {
  await Promise.allSettled(codes.map((c) => deliveryService.invalidatePincodeCache(c)));
}

export const deliveryBulkService = {
  /** Plans + applies a bulk pincode import in a single transaction. */
  async bulkImport(input: { items: BulkItem[]; zoneId?: string; mode?: 'skip' | 'upsert' }): Promise<BulkPlan> {
    if (input.items.length === 0) throw new BadRequestError('No pincodes provided');
    if (input.items.length > 20_000) throw new BadRequestError('Too many pincodes in a single import (max 20,000)');

    const { byId, byName } = await loadZoneMaps();

    // Only look up existing rows for syntactically valid codes.
    const validCodes = [
      ...new Set(input.items.map((i) => (i.code ?? '').trim()).filter((c) => PINCODE_RE.test(c))),
    ];
    const existing = validCodes.length
      ? await prisma.pincode.findMany({ where: { code: { in: validCodes } }, select: { code: true } })
      : [];
    const existingCodes = new Set(existing.map((e) => e.code));

    const plan = planBulkImport(input.items, {
      existingCodes,
      zonesById: byId,
      zonesByName: byName,
      defaultZoneId: input.zoneId,
      mode: input.mode ?? 'skip',
    });

    // Apply the plan atomically.
    await prisma.$transaction(async (tx) => {
      if (plan.toCreate.length) {
        await tx.pincode.createMany({
          data: plan.toCreate.map((p) => ({ code: p.code, zoneId: p.zoneId, isServiceable: true })),
          skipDuplicates: true,
        });
      }
      if (plan.toUpdate.length) {
        // Group updates by target zone to minimise queries.
        const byZone = new Map<string, string[]>();
        for (const p of plan.toUpdate) {
          const list = byZone.get(p.zoneId) ?? [];
          list.push(p.code);
          byZone.set(p.zoneId, list);
        }
        for (const [zoneId, codes] of byZone) {
          await tx.pincode.updateMany({ where: { code: { in: codes } }, data: { zoneId } });
        }
      }
    });

    await invalidateCaches([...plan.toCreate, ...plan.toUpdate].map((p) => p.code));
    return plan;
  },

  /** Imports the maintained Hyderabad pincode list into the given (or first) zone. */
  async importHyderabad(zoneId?: string): Promise<BulkPlan & { source: string }> {
    let targetZoneId = zoneId;
    if (!targetZoneId) {
      const zone = await prisma.deliveryZone.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!zone) throw new BadRequestError('Create a delivery zone first, then import Hyderabad pincodes');
      targetZoneId = zone.id;
    }
    const codes = loadHyderabadPincodes();
    if (codes.length === 0) throw new BadRequestError('Hyderabad pincode dataset is empty or missing');
    const plan = await this.bulkImport({
      items: codes.map((code) => ({ code })),
      zoneId: targetZoneId,
      mode: 'skip',
    });
    return { ...plan, source: 'hyderabad-pincodes.csv' };
  },

  /** Bulk activate / deactivate / move / delete selected pincodes. */
  async bulkAction(input: {
    ids: string[];
    action: 'activate' | 'deactivate' | 'move' | 'delete';
    zoneId?: string;
  }): Promise<{ affected: number }> {
    if (input.ids.length === 0) throw new BadRequestError('No pincodes selected');

    const rows = await prisma.pincode.findMany({
      where: { id: { in: input.ids } },
      select: { id: true, code: true },
    });
    const codes = rows.map((r) => r.code);
    let affected = 0;

    switch (input.action) {
      case 'activate':
        affected = (await prisma.pincode.updateMany({ where: { id: { in: input.ids } }, data: { isServiceable: true } })).count;
        break;
      case 'deactivate':
        affected = (await prisma.pincode.updateMany({ where: { id: { in: input.ids } }, data: { isServiceable: false } })).count;
        break;
      case 'move':
        if (!input.zoneId) throw new BadRequestError('Select a destination zone');
        affected = (await prisma.pincode.updateMany({ where: { id: { in: input.ids } }, data: { zoneId: input.zoneId } })).count;
        break;
      case 'delete':
        affected = (await prisma.pincode.deleteMany({ where: { id: { in: input.ids } } })).count;
        break;
    }

    await invalidateCaches(codes);
    return { affected };
  },
};
