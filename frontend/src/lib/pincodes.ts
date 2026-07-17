/** Client-side parsing/validation for the bulk-import preview. The backend
 * re-validates authoritatively; this only powers the pre-import summary. */

export interface ParsedPincodes {
  valid: string[]; // unique, 6-digit
  invalid: string[];
  duplicates: number;
}

export function parseAndValidate(raw: string): ParsedPincodes {
  const tokens = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;

  for (const t of tokens) {
    if (!/^\d{6}$/.test(t)) {
      invalid.push(t);
      continue;
    }
    if (seen.has(t)) {
      duplicates += 1;
      continue;
    }
    seen.add(t);
    valid.push(t);
  }
  return { valid, invalid, duplicates };
}

export interface CsvRow {
  code: string;
  zoneName?: string;
}

/** Parses a CSV with optional `pincode,zoneName` header into rows. */
export function parseCsv(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',').map((c) => c.trim());
    if (i === 0 && /pincode/i.test(cols[0] ?? '')) continue;
    rows.push({ code: cols[0] ?? '', zoneName: cols[1] || undefined });
  }
  return rows;
}
