import { randomBytes, createHash } from 'node:crypto';
import { customAlphabet } from 'nanoid';

/** Generates a cryptographically-random opaque token (URL-safe hex). */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/** One-way hash for storing tokens at rest (never store raw tokens). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const referralAlphabet = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

/** Human-friendly referral code (no ambiguous characters). */
export function generateReferralCode(): string {
  return referralAlphabet();
}

const orderAlphabet = customAlphabet('0123456789', 8);

/** Order number like TSG-240716-01234567. */
export function generateOrderNumber(): string {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `TSG-${ymd}-${orderAlphabet()}`;
}
