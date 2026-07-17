import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Loads the maintainable Hyderabad pincode list from the CSV shipped with the
 * project (backend/prisma/data/hyderabad-pincodes.csv). The CSV has a header
 * row `pincode,area`; only valid 6-digit pincodes are returned, de-duplicated.
 *
 * Resolution is robust across `tsx` (dev, cwd=backend) and the compiled build
 * (prod, cwd=/app with prisma/ copied into the image): it tries the module-
 * relative path first, then the cwd-relative path.
 */
export function loadHyderabadPincodes(): string[] {
  const candidates: string[] = [];
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // src/shared -> ../../prisma/data ; dist/shared -> ../../prisma/data
    candidates.push(join(here, '..', '..', 'prisma', 'data', 'hyderabad-pincodes.csv'));
  } catch {
    // import.meta.url unavailable — fall through to cwd resolution
  }
  candidates.push(join(process.cwd(), 'prisma', 'data', 'hyderabad-pincodes.csv'));

  let raw = '';
  for (const path of candidates) {
    try {
      raw = readFileSync(path, 'utf8');
      break;
    } catch {
      // try next candidate
    }
  }
  if (!raw) return [];

  const seen = new Set<string>();
  const codes: string[] = [];
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (i === 0 && /pincode/i.test(line)) continue; // header
    const code = line.split(',')[0]?.trim() ?? '';
    if (/^\d{6}$/.test(code) && !seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }
  return codes;
}
