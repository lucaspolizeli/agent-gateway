export type KeyValueRow = { id: number; key: string; value: string };

let nextRowId = 1;

export function newRow(key = "", value = ""): KeyValueRow {
  return { id: nextRowId++, key, value };
}

export function rowsFromRecord(record: Record<string, string>): KeyValueRow[] {
  return Object.entries(record).map(([key, value]) => newRow(key, value));
}

/** Blank keys are rows the user has not filled in yet, so they are dropped rather than rejected. */
export function recordFromRows(rows: KeyValueRow[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key !== "") {
      record[key] = row.value;
    }
  }
  return record;
}

export function duplicateKeys(rows: KeyValueRow[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of rows) {
    const key = row.key.trim();
    if (key === "") {
      continue;
    }
    if (seen.has(key)) {
      duplicates.add(key);
    }
    seen.add(key);
  }
  return [...duplicates];
}
