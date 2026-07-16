import { describe, it, expect, beforeAll } from 'vitest';

// Configure the minimal env the modules validate at import time.
beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= 'test_access_secret_value_123456';
  process.env.JWT_REFRESH_SECRET ??= 'test_refresh_secret_value_123456';
  process.env.DATABASE_URL ??= 'mysql://root:root@localhost:3306/test';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
});

describe('password hashing', () => {
  it('hashes and verifies a password', async () => {
    const { hashPassword, verifyPassword } = await import('../src/shared/password.js');
    const hash = await hashPassword('Secret123');
    expect(hash).not.toBe('Secret123');
    expect(await verifyPassword('Secret123', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('jwt', () => {
  it('round-trips an access token', async () => {
    const { signAccessToken, verifyAccessToken } = await import('../src/shared/jwt.js');
    const token = signAccessToken({ sub: 'u1', role: 'CUSTOMER', email: 'a@b.com' });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('u1');
    expect(payload.role).toBe('CUSTOMER');
  });

  it('rejects a tampered token', async () => {
    const { verifyAccessToken } = await import('../src/shared/jwt.js');
    expect(() => verifyAccessToken('not.a.jwt')).toThrow();
  });
});

describe('tokens', () => {
  it('hashes tokens deterministically and uniquely', async () => {
    const { generateOpaqueToken, hashToken, generateReferralCode } = await import(
      '../src/shared/tokens.js'
    );
    const raw = generateOpaqueToken();
    expect(hashToken(raw)).toBe(hashToken(raw));
    expect(hashToken(raw)).not.toBe(hashToken(generateOpaqueToken()));
    expect(generateReferralCode()).toMatch(/^[A-Z0-9]{8}$/);
  });
});
