/**
 * READ-ONLY MySQL → Firebase Auth import-ready JSON export.
 *
 * Part of the Firebase Authentication migration (objectives 9/10 —
 * "create scripts for importing existing users from MySQL into Firebase
 * Authentication" / "migration scripts only, DO NOT execute them"). This
 * script only SELECTs from the existing database: it never writes to
 * MySQL, never calls any Firebase API, and is NOT wired into any npm
 * lifecycle script (build/test/dev) that runs automatically — it only runs
 * when invoked by name, and only once Phase 2's import step is explicitly
 * approved.
 *
 * Usage (NOT executed as part of this migration phase):
 *   npm run --workspace backend export:firebase-users > backend/scripts/output/users-export.json
 *
 * Output feeds firebase/functions/scripts/importUsersFromMysql.ts — the
 * (also not-executed) counterpart that calls admin.auth().importUsers().
 * See docs/firebase-migration-audit.md ("bcrypt password-migration
 * analysis") for why this exports the existing bcrypt hash directly
 * (Firebase's native `hash.algorithm: 'BCRYPT'` import support) instead of
 * forcing every user through a password reset.
 */
import { PrismaClient, type Role } from '@prisma/client';

const prisma = new PrismaClient();

export interface ExportedUserRecord {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  phoneNumber?: string;
  disabled: boolean;
  /** Base64 of the raw bcrypt hash string bytes (JSON has no binary type). */
  passwordHashBase64: string;
  customClaims: { role: Role; permissions: string[] };
}

export interface SourceUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  passwordHash: string;
  role: Role;
  emailVerified: boolean;
  isActive: boolean;
  permissions: string[];
}

/**
 * Firebase requires E.164 phone numbers. The backend stores plain 10-digit
 * Indian mobile numbers (see frontend registerSchema), so this assumes the
 * `+91` country code. Returns undefined for anything that doesn't look like
 * a clean 10-digit number rather than guessing.
 */
export function toE164IndianPhone(phone: string | null): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10) return undefined;
  return `+91${digits}`;
}

/** Pure transform, decoupled from the Prisma query for unit testability. */
export function toExportedUserRecord(user: SourceUser): ExportedUserRecord {
  return {
    uid: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.name,
    phoneNumber: toE164IndianPhone(user.phone),
    disabled: !user.isActive,
    passwordHashBase64: Buffer.from(user.passwordHash, 'utf8').toString('base64'),
    customClaims: { role: user.role, permissions: user.permissions },
  };
}

async function main(): Promise<void> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      passwordHash: true,
      role: true,
      emailVerified: true,
      isActive: true,
      permissions: { select: { permission: { select: { key: true } } } },
    },
  });

  const records = users.map((u) =>
    toExportedUserRecord({
      ...u,
      permissions: u.permissions.map((p) => p.permission.key),
    }),
  );

  process.stdout.write(JSON.stringify(records, null, 2));
  process.stderr.write(`\nExported ${records.length} user(s). MySQL was not modified (read-only).\n`);
}

main()
  .catch((err: unknown) => {
    console.error('Export failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
