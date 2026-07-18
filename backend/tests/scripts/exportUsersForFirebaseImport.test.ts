import { describe, it, expect } from 'vitest';
import {
  toE164IndianPhone,
  toExportedUserRecord,
  type SourceUser,
} from '../../scripts/exportUsersForFirebaseImport.js';

function sourceUser(overrides: Partial<SourceUser> = {}): SourceUser {
  return {
    id: 'clx1234567890abcdefghijk',
    name: 'Asha Rao',
    email: 'asha@example.com',
    phone: '9876543210',
    passwordHash: '$2a$12$abcdefghijklmnopqrstuv.wxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    role: 'CUSTOMER',
    emailVerified: true,
    isActive: true,
    permissions: [],
    ...overrides,
  };
}

describe('toE164IndianPhone', () => {
  it('prefixes a clean 10-digit number with +91', () => {
    expect(toE164IndianPhone('9876543210')).toBe('+919876543210');
  });

  it('strips non-digit characters before checking length', () => {
    expect(toE164IndianPhone('98765-43210')).toBe('+919876543210');
  });

  it('returns undefined for null', () => {
    expect(toE164IndianPhone(null)).toBeUndefined();
  });

  it('returns undefined for a number that is not exactly 10 digits', () => {
    expect(toE164IndianPhone('12345')).toBeUndefined();
    expect(toE164IndianPhone('123456789012')).toBeUndefined();
  });
});

describe('toExportedUserRecord', () => {
  it('maps the Prisma id straight to the Firebase uid (stable cross-system identity)', () => {
    const rec = toExportedUserRecord(sourceUser({ id: 'clx1234567890abcdefghijk' }));
    expect(rec.uid).toBe('clx1234567890abcdefghijk');
  });

  it('base64-encodes the raw bcrypt hash bytes losslessly', () => {
    const hash = '$2a$12$abcdefghijklmnopqrstuv.wxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const rec = toExportedUserRecord(sourceUser({ passwordHash: hash }));
    expect(Buffer.from(rec.passwordHashBase64, 'base64').toString('utf8')).toBe(hash);
  });

  it('maps isActive=false to disabled=true (inverted, Firebase-native field name)', () => {
    const rec = toExportedUserRecord(sourceUser({ isActive: false }));
    expect(rec.disabled).toBe(true);
  });

  it('maps isActive=true to disabled=false', () => {
    const rec = toExportedUserRecord(sourceUser({ isActive: true }));
    expect(rec.disabled).toBe(false);
  });

  it('carries role and permissions through unchanged as customClaims', () => {
    const rec = toExportedUserRecord(sourceUser({ role: 'STAFF', permissions: ['orders.manage'] }));
    expect(rec.customClaims).toEqual({ role: 'STAFF', permissions: ['orders.manage'] });
  });

  it('omits phoneNumber when the source phone is null', () => {
    const rec = toExportedUserRecord(sourceUser({ phone: null }));
    expect(rec.phoneNumber).toBeUndefined();
  });

  it('never derives the role from the email address', () => {
    const rec = toExportedUserRecord(sourceUser({ email: 'admin@tsgecart.com', role: 'CUSTOMER' }));
    expect(rec.customClaims.role).toBe('CUSTOMER');
  });
});
