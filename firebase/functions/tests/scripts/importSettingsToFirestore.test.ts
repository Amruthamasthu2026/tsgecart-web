import { describe, it, expect } from 'vitest';
import { toFirestoreSettingDoc, parseArgs, type ExportedSetting } from '../../scripts/importSettingsToFirestore';

function setting(overrides: Partial<ExportedSetting> = {}): ExportedSetting {
  return { key: 'store.name', value: { en: 'TSG eCart' }, updatedAt: '2026-07-19T00:00:00.000Z', ...overrides };
}

describe('toFirestoreSettingDoc', () => {
  it('carries the value through unchanged', () => {
    const doc = toFirestoreSettingDoc(setting());
    expect(doc.value).toEqual({ en: 'TSG eCart' });
  });

  it('does not include key/updatedAt in the document body (key is used only as the doc ID by the caller)', () => {
    const doc = toFirestoreSettingDoc(setting());
    expect(doc).not.toHaveProperty('key');
    expect(doc).not.toHaveProperty('updatedAt');
  });

  it('preserves a primitive (non-object) value', () => {
    expect(toFirestoreSettingDoc(setting({ value: false })).value).toBe(false);
  });
});

describe('parseArgs', () => {
  it('defaults execute to false (dry run)', () => {
    expect(parseArgs(['export.json'])).toEqual({ filePath: 'export.json', execute: false });
  });

  it('sets execute true only with --execute', () => {
    expect(parseArgs(['export.json', '--execute'])).toEqual({ filePath: 'export.json', execute: true });
  });

  it('throws when no file path is given', () => {
    expect(() => parseArgs([])).toThrow();
  });
});
