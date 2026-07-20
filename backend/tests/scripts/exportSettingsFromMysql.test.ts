import { describe, it, expect } from 'vitest';
import { toExportedSetting } from '../../scripts/exportSettingsFromMysql.js';

describe('toExportedSetting', () => {
  it('carries key/value through and converts updatedAt to ISO', () => {
    const result = toExportedSetting({
      key: 'store.name',
      value: { en: 'TSG eCart' },
      updatedAt: new Date('2026-07-19T00:00:00Z'),
    });
    expect(result).toEqual({ key: 'store.name', value: { en: 'TSG eCart' }, updatedAt: '2026-07-19T00:00:00.000Z' });
  });

  it('preserves primitive JSON values (not just objects)', () => {
    const result = toExportedSetting({ key: 'maintenanceMode', value: false, updatedAt: new Date('2026-07-19T00:00:00Z') });
    expect(result.value).toBe(false);
  });
});
