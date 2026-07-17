/**
 * Pure, database-free helpers for bulk pincode import. Kept side-effect free so
 * the parsing / validation / planning logic can be unit-tested without a live
 * database. The route layer loads existing codes + zones, calls `planBulkImport`,
 * then applies the resulting plan inside a transaction.
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
  toUpdate: PlanEntry[]; // only populated in 'upsert' mode for existing codes
  invalid: Array<{ code: string; reason: string }>;
  failed: Array<{ code: string; reason: string }>;
  duplicates: string[];
  skipped: string[]; // existing codes left untouched (skip mode)
  warnings: Array<{ code: string; message: string }>;
  stats: {
    total: number;
    added: number;
    updated: number;
    skipped: number;
    invalid: number;
    failed: number;
    duplicates: number;
  };
}

/** Splits free-text (commas, spaces, tabs, newlines, semicolons) into tokens. */
export function parsePincodes(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Builds a de-duplicated list of BulkItems from pasted text + a shared zone. */
export function itemsFromText(raw: string): BulkItem[] {
  return parsePincodes(raw).map((code) => ({ code }));
}

/**
 * Parses a CSV whose (optional) header is `pincode,zoneName`. Rows without a
 * second column carry no zoneName and fall back to the default zone.
 */
export function itemsFromCsv(csv: string): BulkItem[] {
  const items: BulkItem[] = [];
  const lines = csv.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',').map((c) => c.trim());
    if (i === 0 && /pincode/i.test(cols[0] ?? '')) continue; // header
    const code = cols[0] ?? '';
    const zoneName = cols[1] || undefined;
    items.push({ code, zoneName });
  }
  return items;
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

    // Resolve the target zone: per-row zoneName wins, else the default zone.
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
