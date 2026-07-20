import { describe, it, expect } from 'vitest';
import { planBulkImport, type PlanContext, type ZoneRef } from '../../src/delivery/pincodeImport.logic';

const hyd: ZoneRef = { id: 'zone-hyd', name: 'Hyderabad Core', isActive: true };
const inactiveZone: ZoneRef = { id: 'zone-old', name: 'Retired Zone', isActive: false };

function baseCtx(overrides: Partial<PlanContext> = {}): PlanContext {
  return {
    existingCodes: new Set(),
    zonesById: new Map([[hyd.id, hyd]]),
    zonesByName: new Map([[hyd.name.toLowerCase(), hyd]]),
    defaultZoneId: hyd.id,
    mode: 'skip',
    ...overrides,
  };
}

describe('planBulkImport', () => {
  it('plans a new pincode as toCreate using the default zone', () => {
    const plan = planBulkImport([{ code: '500001' }], baseCtx());
    expect(plan.toCreate).toEqual([{ code: '500001', zoneId: 'zone-hyd' }]);
    expect(plan.stats.added).toBe(1);
  });

  it('rejects a code that is not exactly 6 digits', () => {
    const plan = planBulkImport([{ code: '5000A1' }, { code: '12345' }], baseCtx());
    expect(plan.invalid).toHaveLength(2);
    expect(plan.stats.invalid).toBe(2);
  });

  it('deduplicates repeated codes within the same batch', () => {
    const plan = planBulkImport([{ code: '500001' }, { code: '500001' }], baseCtx());
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.duplicates).toEqual(['500001']);
  });

  it('resolves a per-row zoneName over the default zone', () => {
    const ctx = baseCtx({
      zonesById: new Map([[hyd.id, hyd], ['zone-other', { id: 'zone-other', name: 'Other', isActive: true }]]),
      zonesByName: new Map([[hyd.name.toLowerCase(), hyd], ['other', { id: 'zone-other', name: 'Other', isActive: true }]]),
    });
    const plan = planBulkImport([{ code: '500002', zoneName: 'Other' }], ctx);
    expect(plan.toCreate).toEqual([{ code: '500002', zoneId: 'zone-other' }]);
  });

  it('fails a row whose zoneName does not resolve to any known zone', () => {
    const plan = planBulkImport([{ code: '500003', zoneName: 'Nonexistent' }], baseCtx());
    expect(plan.failed).toEqual([{ code: '500003', reason: 'Zone "Nonexistent" not found' }]);
  });

  it('fails a row with no zoneName and no default zone configured', () => {
    const plan = planBulkImport([{ code: '500004' }], baseCtx({ defaultZoneId: undefined }));
    expect(plan.failed).toEqual([{ code: '500004', reason: 'No delivery zone specified' }]);
  });

  it('warns (but still plans) when the resolved zone is inactive', () => {
    const ctx = baseCtx({ zonesById: new Map([[inactiveZone.id, inactiveZone]]), defaultZoneId: inactiveZone.id });
    const plan = planBulkImport([{ code: '500005' }], ctx);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.toCreate).toHaveLength(1);
  });

  it('skip mode: an existing code is left untouched, not updated', () => {
    const ctx = baseCtx({ existingCodes: new Set(['500001']), mode: 'skip' });
    const plan = planBulkImport([{ code: '500001' }], ctx);
    expect(plan.skipped).toEqual(['500001']);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it('upsert mode: an existing code is planned as toUpdate', () => {
    const ctx = baseCtx({ existingCodes: new Set(['500001']), mode: 'upsert' });
    const plan = planBulkImport([{ code: '500001' }], ctx);
    expect(plan.toUpdate).toEqual([{ code: '500001', zoneId: 'zone-hyd' }]);
    expect(plan.skipped).toHaveLength(0);
  });

  it('computes accurate summary stats across a mixed batch', () => {
    const ctx = baseCtx({ existingCodes: new Set(['500001']), mode: 'skip' });
    const plan = planBulkImport(
      [{ code: '500001' }, { code: '500002' }, { code: 'bad' }, { code: '500002' }],
      ctx,
    );
    expect(plan.stats).toEqual({ total: 4, added: 1, updated: 0, skipped: 1, invalid: 1, failed: 0, duplicates: 1 });
  });
});
