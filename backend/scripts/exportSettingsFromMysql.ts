/**
 * READ-ONLY MySQL → Firestore import-ready JSON export for platform
 * settings (Firebase migration Phase 6, ports the Prisma `Setting` model —
 * `id, key (unique), value (Json), updatedAt`).
 *
 * Read-only — never writes to MySQL, never calls Firebase, not wired into
 * any automatic npm lifecycle script.
 *
 * Usage (NOT executed as part of this migration phase):
 *   npm run --workspace backend export:firebase-settings > backend/scripts/output/settings-export.json
 *
 * Output feeds firebase/functions/scripts/importSettingsToFirestore.ts.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ExportedSetting {
  key: string;
  value: unknown;
  updatedAt: string;
}

interface SettingRow {
  key: string;
  value: unknown;
  updatedAt: Date;
}

/** Pure — no Prisma call — unit-testable on its own. */
export function toExportedSetting(row: SettingRow): ExportedSetting {
  return { key: row.key, value: row.value, updatedAt: row.updatedAt.toISOString() };
}

async function main(): Promise<void> {
  const settings = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
  const exported = settings.map((s) => toExportedSetting(s as unknown as SettingRow));

  process.stdout.write(JSON.stringify({ settings: exported }, null, 2));
  process.stderr.write(`\nExported ${exported.length} setting(s). MySQL was not modified (read-only).\n`);
}

main()
  .catch((err: unknown) => {
    console.error('Export failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
