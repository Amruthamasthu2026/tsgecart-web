/**
 * Pure, Firestore-free bulk-pincode-import planner, migration Phase 6 —
 * a direct port of `backend/src/modules/delivery/pincodeImport.ts`
 * (the audit explicitly flags this module as "designed to be reused as-is
 * for a Firestore batched-write port"; only the storage layer that
 * supplies `existingCodes`/`zonesById`/`zonesByName` and applies the
 * resulting plan changes — see delivery.function.ts). Kept side-effect
 * free so the exact validation/dedup/zone-resolution rules are
 * independently unit-testable, identical to the Express version.
 */

export const PINCODE_RE = /^\d{6}$/;

export interface BulkItem {
  code: string;
  zoneName?: string;
}

export interface ZoneRef {
  id: string;
  name: string;
  isActive: boolean;
}

export interface PlanContext {
  existingCodes: Set<string>;
  zonesById: Map<string, ZoneRef>;
  zonesByName: Map<string, ZoneRef>; // key = lowercased name
  defaultZoneId?: string;
  mode: 'skip' | 'upsert';
}

export interface PlanEntry {
  code: string;
  zoneId: string;
}

export interface BulkPlan {
  toCreate: PlanEntry[];
  toUpdate: PlanEntry[];
  invalid: Array<{ code: string; reason: string }>;
  failed: Array<{ code: string; reason: string }>;
  duplicates: string[];
  skipped: string[];
  warnings: Array<{ code: string; message: string }>;
  stats: { total: number; added: number; updated: number; skipped: number; invalid: number; failed: number; duplicates: number };
}

export function planBulkImport(items: BulkItem[], ctx: PlanContext): BulkPlan {
  const plan: BulkPlan = {
    toCreate: [],
    toUpdate: [],
    invalid: [],
    failed: [],
    duplicates: [],
    skipped: [],
    warnings: [],
    stats: { total: items.length, added: 0, updated: 0, skipped: 0, invalid: 0, failed: 0, duplicates: 0 },
  };
  const seen = new Set<string>();

  for (const item of items) {
    const code = (item.code ?? '').trim();

    if (!PINCODE_RE.test(code)) {
      plan.invalid.push({ code, reason: 'Not a valid 6-digit pincode' });
      continue;
    }
    if (seen.has(code)) {
      plan.duplicates.push(code);
      continue;
    }
    seen.add(code);

    let zone: ZoneRef | undefined;
    if (item.zoneName) {
      zone = ctx.zonesByName.get(item.zoneName.toLowerCase());
      if (!zone) {
        plan.failed.push({ code, reason: `Zone "${item.zoneName}" not found` });
        continue;
      }
    } else if (ctx.defaultZoneId) {
      zone = ctx.zonesById.get(ctx.defaultZoneId);
      if (!zone) {
        plan.failed.push({ code, reason: 'Selected delivery zone no longer exists' });
        continue;
      }
    } else {
      plan.failed.push({ code, reason: 'No delivery zone specified' });
      continue;
    }

    if (!zone.isActive) {
      plan.warnings.push({ code, message: `Zone "${zone.name}" is inactive — pincode won't be serviceable until it's activated` });
    }

    if (ctx.existingCodes.has(code)) {
      if (ctx.mode === 'upsert') {
        plan.toUpdate.push({ code, zoneId: zone.id });
      } else {
        plan.skipped.push(code);
      }
    } else {
      plan.toCreate.push({ code, zoneId: zone.id });
    }
  }

  plan.stats = {
    total: items.length,
    added: plan.toCreate.length,
    updated: plan.toUpdate.length,
    skipped: plan.skipped.length,
    invalid: plan.invalid.length,
    failed: plan.failed.length,
    duplicates: plan.duplicates.length,
  };
  return plan;
}
