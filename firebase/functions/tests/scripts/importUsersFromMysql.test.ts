import { describe, it, expect } from 'vitest';
import {
  chunk,
  parseArgs,
  toUserImportRecord,
  IMPORT_BATCH_SIZE,
  type ExportedUserRecord,
} from '../../scripts/importUsersFromMysql';

function exportedUser(overrides: Partial<ExportedUserRecord> = {}): ExportedUserRecord {
  return {
    uid: 'clx1234567890abcdefghijk',
    email: 'asha@example.com',
    emailVerified: true,
    displayName: 'Asha Rao',
    phoneNumber: '+919876543210',
    disabled: false,
    passwordHashBase64: Buffer.from('$2a$12$fakehash', 'utf8').toString('base64'),
    customClaims: { role: 'CUSTOMER', permissions: [] },
    ...overrides,
  };
}

describe('toUserImportRecord', () => {
  it('decodes the base64 password hash back to the original bcrypt bytes', () => {
    const rec = toUserImportRecord(exportedUser());
    expect(rec.passwordHash).toBeInstanceOf(Buffer);
    expect(rec.passwordHash.toString('utf8')).toBe('$2a$12$fakehash');
  });

  it('carries uid/email/displayName/phoneNumber/disabled through unchanged', () => {
    const rec = toUserImportRecord(
      exportedUser({ uid: 'u1', email: 'e@x.com', displayName: 'E X', phoneNumber: '+911111111111', disabled: true }),
    );
    expect(rec).toMatchObject({
      uid: 'u1',
      email: 'e@x.com',
      displayName: 'E X',
      phoneNumber: '+911111111111',
      disabled: true,
    });
  });

  it('preserves customClaims exactly, including a STAFF permission set', () => {
    const rec = toUserImportRecord(exportedUser({ customClaims: { role: 'STAFF', permissions: ['orders.manage'] } }));
    expect(rec.customClaims).toEqual({ role: 'STAFF', permissions: ['orders.manage'] });
  });
});

describe('chunk', () => {
  it('splits into groups of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single batch when items fit within one chunk', () => {
    expect(chunk([1, 2, 3], IMPORT_BATCH_SIZE)).toEqual([[1, 2, 3]]);
  });

  it('returns an empty array for empty input', () => {
    expect(chunk([], 100)).toEqual([]);
  });

  it('never produces a batch larger than IMPORT_BATCH_SIZE (the Admin SDK limit)', () => {
    const items = Array.from({ length: 2500 }, (_, i) => i);
    const batches = chunk(items, IMPORT_BATCH_SIZE);
    expect(batches).toHaveLength(3);
    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(IMPORT_BATCH_SIZE);
    }
  });
});

describe('parseArgs', () => {
  it('defaults execute to false (dry run) when --execute is absent', () => {
    expect(parseArgs(['export.json'])).toEqual({ filePath: 'export.json', execute: false });
  });

  it('sets execute to true only when --execute is explicitly passed', () => {
    expect(parseArgs(['export.json', '--execute'])).toEqual({ filePath: 'export.json', execute: true });
  });

  it('throws when no file path is given', () => {
    expect(() => parseArgs([])).toThrow();
    expect(() => parseArgs(['--execute'])).toThrow();
  });
});
