/**
 * NOT EXECUTED. Bulk-imports users into Firebase Authentication from the
 * JSON produced by `backend/scripts/exportUsersForFirebaseImport.ts`, using
 * the Admin SDK's native BCRYPT import support (migration objectives 9/10 —
 * see docs/firebase-migration-audit.md, "bcrypt password-migration
 * analysis", Option A — direct `importUsers({hash:{algorithm:'BCRYPT'}})`
 * over a forced password reset).
 *
 * Safe by default: running this script with no `--execute` flag is a DRY
 * RUN. It reads the export file, validates + transforms every record, and
 * prints a summary — it calls nothing on Firebase. Only `--execute`
 * performs the real `admin.auth().importUsers()` call(s), and this script
 * is not invoked anywhere automatically (no npm lifecycle hook, no CI step).
 *
 * Usage (for a human operator, after this phase is separately approved):
 *   npx tsx scripts/importUsersFromMysql.ts <path-to-export.json>              # dry run (default)
 *   npx tsx scripts/importUsersFromMysql.ts <path-to-export.json> --execute    # real import
 */
import { readFileSync } from 'node:fs';
import { logger } from '../src/shared/logger';

export interface ExportedUserRecord {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  phoneNumber?: string;
  disabled: boolean;
  passwordHashBase64: string;
  customClaims: { role: string; permissions: string[] };
}

export interface UserImportRecord {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  phoneNumber?: string;
  disabled: boolean;
  passwordHash: Buffer;
  customClaims: { role: string; permissions: string[] };
}

/** Pure — no Admin SDK call, no file I/O — unit-testable on its own. */
export function toUserImportRecord(rec: ExportedUserRecord): UserImportRecord {
  return {
    uid: rec.uid,
    email: rec.email,
    emailVerified: rec.emailVerified,
    displayName: rec.displayName,
    phoneNumber: rec.phoneNumber,
    disabled: rec.disabled,
    passwordHash: Buffer.from(rec.passwordHashBase64, 'base64'),
    customClaims: rec.customClaims,
  };
}

/** admin.auth().importUsers() accepts at most 1000 records per call. */
export const IMPORT_BATCH_SIZE = 1000;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export interface ParsedArgs {
  filePath: string;
  execute: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const execute = argv.includes('--execute');
  const filePath = argv.find((a) => !a.startsWith('--'));
  if (!filePath) {
    throw new Error('Usage: importUsersFromMysql.ts <path-to-export.json> [--execute]');
  }
  return { filePath, execute };
}

async function main(): Promise<void> {
  const { filePath, execute } = parseArgs(process.argv.slice(2));
  const raw = readFileSync(filePath, 'utf8');
  const exported = JSON.parse(raw) as ExportedUserRecord[];
  const records = exported.map(toUserImportRecord);
  const batches = chunk(records, IMPORT_BATCH_SIZE);

  logger.info('Loaded user import records', { count: records.length, batches: batches.length });
  console.log(
    `Loaded ${records.length} user(s) from ${filePath} (${batches.length} batch(es) of up to ${IMPORT_BATCH_SIZE}).`,
  );
  if (records[0]) {
    console.log('Sample record (claims only — password hash never printed):', {
      uid: records[0].uid,
      email: records[0].email,
      customClaims: records[0].customClaims,
    });
  }

  if (!execute) {
    console.log('\nDRY RUN — no data was sent to Firebase. Re-run with --execute to perform the real import.');
    return;
  }

  // Lazy import so `adminAuth`/`initializeApp()` is never touched during a
  // dry run or during unit tests importing this module for its pure helpers.
  const { auth: adminAuth } = await import('../src/config/firebaseAdmin');

  console.log('\nEXECUTING real admin.auth().importUsers() call(s)...');
  for (const [i, batch] of batches.entries()) {
    const result = await adminAuth.importUsers(batch, { hash: { algorithm: 'BCRYPT' } });
    logger.info('Import batch complete', {
      batch: i + 1,
      successCount: result.successCount,
      failureCount: result.failureCount,
    });
    console.log(`Batch ${i + 1}/${batches.length}: ${result.successCount} succeeded, ${result.failureCount} failed.`);
    if (result.failureCount > 0) {
      console.error('Failures:', result.errors);
    }
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('Import failed:', err);
    process.exitCode = 1;
  });
}
