/**
 * NOT EXECUTED AUTOMATICALLY. Imports platform settings into Firestore
 * from the JSON produced by `backend/scripts/exportSettingsFromMysql.ts`
 * (Firebase migration Phase 6).
 *
 * Safe by default: dry run unless `--execute` is passed. Idempotent: the
 * Firestore doc ID is the setting's `key` itself (already globally
 * unique in MySQL, and matches the `platformSettings/{key}` shape the
 * Callables/Rules already expect) — the original MySQL cuid `id` is not
 * carried into Firestore at all, avoiding a redundant identifier. Every
 * write is a deterministic `set()`.
 *
 * Usage:
 *   npx tsx scripts/importSettingsToFirestore.ts <path-to-export.json>              # dry run (default)
 *   npx tsx scripts/importSettingsToFirestore.ts <path-to-export.json> --execute    # real write
 */
import { readFileSync } from 'node:fs';
import { logger } from '../src/shared/logger';

export interface ExportedSetting {
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface FirestoreSettingWrite {
  value: unknown;
}

/** Pure — no Admin SDK, no file I/O — unit-testable on its own. */
export function toFirestoreSettingDoc(setting: ExportedSetting): FirestoreSettingWrite {
  return { value: setting.value };
}

export interface ParsedArgs {
  filePath: string;
  execute: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const execute = argv.includes('--execute');
  const filePath = argv.find((a) => !a.startsWith('--'));
  if (!filePath) {
    throw new Error('Usage: importSettingsToFirestore.ts <path-to-export.json> [--execute]');
  }
  return { filePath, execute };
}

async function main(): Promise<void> {
  const { filePath, execute } = parseArgs(process.argv.slice(2));
  const raw = readFileSync(filePath, 'utf8');
  const { settings } = JSON.parse(raw) as { settings: ExportedSetting[] };

  logger.info('Loaded settings import records', { settings: settings.length });
  console.log(`Loaded ${settings.length} setting(s) from ${filePath}.`);

  if (!execute) {
    console.log('\nDRY RUN — nothing was written to Firestore. Re-run with --execute to perform the real import.');
    return;
  }

  const { db } = await import('../src/config/firebaseAdmin');
  const { FieldValue, Timestamp } = await import('firebase-admin/firestore');

  console.log('\nEXECUTING real Firestore writes...');
  let batch = db.batch();
  let opsInBatch = 0;
  const commitIfFull = async () => {
    if (opsInBatch >= 400) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  };

  for (const setting of settings) {
    const settingDoc = toFirestoreSettingDoc(setting);
    batch.set(db.collection('platformSettings').doc(setting.key), {
      ...settingDoc,
      updatedAt: setting.updatedAt ? Timestamp.fromDate(new Date(setting.updatedAt)) : FieldValue.serverTimestamp(),
    });
    opsInBatch += 1;
    await commitIfFull();
  }
  if (opsInBatch > 0) {
    await batch.commit();
  }

  logger.info('Firestore settings import complete', { settings: settings.length });
  console.log(`Wrote ${settings.length} setting(s).`);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('Import failed:', err);
    process.exitCode = 1;
  });
}
