/**
 * Money is stored in Firestore as integer minor units ("paise", 1/100 of a
 * rupee) per docs/firebase-migration-audit.md §30 ("avoids all floating-
 * point/decimal-portability issues"). The existing MySQL/Prisma backend
 * stores `Decimal` rupee amounts (e.g. "199.50"); these pure helpers convert
 * between the two representations at the migration boundary (export/import
 * scripts) and at read time (Functions responses back to the frontend).
 */

/** Accepts a rupee amount as a number or a decimal string (e.g. "199.50"). */
export function rupeesToPaise(rupees: number | string): number {
  const value = typeof rupees === 'string' ? Number(rupees) : rupees;
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot convert non-finite rupee amount to paise: ${rupees}`);
  }
  return Math.round(value * 100);
}

/** Returns a rupee amount as a number with exactly 2 decimal places of precision. */
export function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100;
}
