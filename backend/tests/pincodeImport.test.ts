import { describe, it, expect } from 'vitest';
import {
  parsePincodes,
  itemsFromText,
  itemsFromCsv,
  planBulkImport,
  type PlanContext,
  type ZoneRef,
} from '../src/modules/delivery/pincodeImport.js';

const ZONE_A: ZoneRef = { id: 'zone_a', name: 'Hyderabad Central', isActive: true };
const ZONE_B: ZoneRef = { id: 'zone_b', name: 'Hyderabad West', isActive: true };
const ZONE_INACTIVE: ZoneRef = { id: 'zone_x', name: 'Paused Zone', isActive: false };

function ctx(overrides: Partial<PlanContext> = {}): PlanContext {
  const zones = overrides.zonesById
    ? [...overrides.zonesById.values()]
    : [ZONE_A, ZONE_B, ZONE_INACTIVE];
  const byId = new Map(zones.map((z) => [z.id, z]));
  const byName = new Map(zones.map((z) => [z.name.toLowerCase(), z]));
  return {
    existingCodes: new Set(),
    zonesById: byId,
    zonesByName: byName,
    defaultZoneId: ZONE_A.id,
    mode: 'skip',
    ...overrides,
  };
}

describe('parsePincodes', () => {
  it('splits on commas, spaces, tabs, semicolons and newlines', () => {
    expect(parsePincodes('500001, 500002\n500003\t500004;500005 500006')).toEqual([
      '500001', '500002', '500003', '500004', '500005', '500006',
    ]);
  });
  it('ignores blank tokens', () => {
    expect(parsePincodes('  500001 ,,  \n\n 500002 ')).toEqual(['500001', '500002']);
  });
});

describe('itemsFromCsv', () => {
  it('parses pincode,zoneName rows and skips the header', () => {
    const csv = 'pincode,zoneName\n500001,Hyderabad Central\n500002,Hyderabad West';
    expect(itemsFromCsv(csv)).toEqual([
      { code: '500001', zoneName: 'Hyderabad Central' },
      { code: '500002', zoneName: 'Hyderabad West' },
    ]);
  });
  it('treats a missing second column as no zoneName', () => {
    expect(itemsFromCsv('500001\n500002')).toEqual([
      { code: '500001', zoneName: undefined },
      { code: '500002', zoneName: undefined },
    ]);
  });
});

describe('planBulkImport — validation', () => {
  it('flags non-6-digit values as invalid', () => {
    const plan = planBulkImport(itemsFromText('500001 5000 50000A 5000012 abcdef'), ctx());
    expect(plan.stats.added).toBe(1);
    expect(plan.stats.invalid).toBe(4);
    expect(plan.invalid.map((i) => i.code)).toContain('50000A');
  });

  it('de-duplicates repeated pincodes within one request', () => {
    const plan = planBulkImport(itemsFromText('500001 500001 500002 500002 500002'), ctx());
    expect(plan.stats.added).toBe(2);
    expect(plan.stats.duplicates).toBe(3);
  });
});

describe('planBulkImport — existing pincodes', () => {
  it('skips existing codes in skip mode', () => {
    const plan = planBulkImport(itemsFromText('500001 500002 500003'), ctx({
      existingCodes: new Set(['500002']),
    }));
    expect(plan.stats.added).toBe(2);
    expect(plan.stats.skipped).toBe(1);
    expect(plan.skipped).toEqual(['500002']);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it('updates existing codes in upsert mode', () => {
    const plan = planBulkImport(itemsFromText('500001 500002'), ctx({
      existingCodes: new Set(['500002']),
      mode: 'upsert',
    }));
    expect(plan.stats.added).toBe(1);
    expect(plan.stats.updated).toBe(1);
    expect(plan.toUpdate[0]).toEqual({ code: '500002', zoneId: ZONE_A.id });
  });
});

describe('planBulkImport — zone resolution', () => {
  it('resolves per-row zoneName over the default zone', () => {
    const plan = planBulkImport(
      [
        { code: '500001', zoneName: 'Hyderabad West' },
        { code: '500002' },
      ],
      ctx(),
    );
    expect(plan.toCreate).toEqual([
      { code: '500001', zoneId: ZONE_B.id },
      { code: '500002', zoneId: ZONE_A.id },
    ]);
  });

  it('fails a row whose zoneName does not exist', () => {
    const plan = planBulkImport([{ code: '500001', zoneName: 'Nowhere' }], ctx());
    expect(plan.stats.failed).toBe(1);
    expect(plan.failed[0].reason).toMatch(/not found/i);
  });

  it('fails when no zone can be resolved', () => {
    const plan = planBulkImport(itemsFromText('500001'), ctx({ defaultZoneId: undefined }));
    expect(plan.stats.failed).toBe(1);
    expect(plan.stats.added).toBe(0);
  });
});

describe('planBulkImport — inactive zones', () => {
  it('still imports but warns when the target zone is inactive', () => {
    const plan = planBulkImport(itemsFromText('500001'), ctx({ defaultZoneId: ZONE_INACTIVE.id }));
    expect(plan.stats.added).toBe(1);
    expect(plan.toCreate[0].zoneId).toBe(ZONE_INACTIVE.id);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0].message).toMatch(/inactive/i);
  });
});

describe('loadHyderabadPincodes (CSV dataset)', () => {
  it('loads valid, de-duplicated 6-digit codes from the shipped CSV', async () => {
    const { loadHyderabadPincodes } = await import('../src/shared/pincodeData.js');
    const codes = loadHyderabadPincodes();
    expect(codes.length).toBeGreaterThan(20);
    expect(codes.every((c) => /^\d{6}$/.test(c))).toBe(true);
    expect(new Set(codes).size).toBe(codes.length); // no duplicates
    expect(codes).toContain('500001');
  });
});

describe('planBulkImport — large imports', () => {
  it('handles a large batch with dedupe efficiently', () => {
    const codes: string[] = [];
    for (let i = 0; i < 5000; i += 1) {
      codes.push(String(500000 + (i % 2500)).padStart(6, '0')); // 2500 unique, each twice
    }
    const plan = planBulkImport(codes.map((code) => ({ code })), ctx());
    expect(plan.stats.total).toBe(5000);
    expect(plan.stats.added).toBe(2500);
    expect(plan.stats.duplicates).toBe(2500);
  });
});
