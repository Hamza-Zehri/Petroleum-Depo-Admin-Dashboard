// Robust CSV parsing + template helpers for the admin dashboard bulk imports.
// Handles quoted fields, embedded commas, escaped quotes, and CRLF/LF line endings.

export const CSV_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const CSV_MAX_ROWS = 5000;

export interface CsvTable {
  headers: string[];
  rows: string[][];
  errors: string[];
}

/** Parse CSV text into headers + rows. Collects structural errors (not row-level). */
export function parseCsv(text: string): CsvTable {
  const errors: string[] = [];
  if (text.trim() === "") {
    return { headers: [], rows: [], errors: ["File is empty."] };
  }

  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let atFieldStart = true;
  let i = 0;
  const n = text.length;

  function pushField() {
    row.push(field);
    field = "";
    atFieldStart = true;
  }
  function pushRow() {
    // Drop a single trailing empty row caused by a final newline.
    if (row.length === 1 && row[0] === "" && records.length > 0) {
      // skip trailing blank line
    } else {
      records.push(row);
    }
    row = [];
    field = "";
    atFieldStart = true;
  }

  // We'll collect all records including possibly trailing empty; filter later.
  const all: string[][] = [];
  // Redo cleanly:
  all.length = 0;
  // Reset
  field = "";
  row = [];
  inQuotes = false;
  atFieldStart = true;
  i = 0;

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < n && text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      if (atFieldStart) {
        inQuotes = true;
        atFieldStart = false;
        i++;
        continue;
      }
      // quote in middle of unquoted field -> treat as literal
      field += ch;
      i++;
      continue;
    }
    if (ch === ",") {
      pushField();
      atFieldStart = true;
      i++;
      continue;
    }
    if (ch === "\n") {
      pushField();
      all.push(row);
      row = [];
      field = "";
      atFieldStart = true;
      i++;
      continue;
    }
    if (ch === "\r") {
      // handle CRLF
      if (i + 1 < n && text[i + 1] === "\n") {
        i++;
        continue; // skip, newline handled above? Actually we need to push on \n
      }
      // lone CR as line ending
      pushField();
      all.push(row);
      row = [];
      field = "";
      atFieldStart = true;
      i++;
      continue;
    }
    field += ch;
    atFieldStart = false;
    i++;
  }
  // trailing field/row
  if (field !== "" || row.length > 0 || atFieldStart === false) {
    // push if there's anything
    if (row.length > 0 || field !== "" ) {
      row.push(field);
      all.push(row);
    }
  }

  // Remove completely empty trailing rows
  while (all.length > 0 && all[all.length - 1].every((c) => c.trim() === "")) {
    all.pop();
  }

  if (all.length === 0) {
    return { headers: [], rows: [], errors: ["No data rows found."] };
  }

  const headers = all[0].map((h) => h.trim());
  const rows = all.slice(1);

  // Normalize row widths
  const width = headers.length;
  for (const r of rows) {
    while (r.length < width) r.push("");
    if (r.length > width) {
      // extra columns -> merge into last? keep as-is but trim
    }
  }

  // Validate header count consistency
  const badWidths = rows.filter((r) => r.length !== width);
  if (badWidths.length > 0) {
    errors.push(`${badWidths.length} row(s) have a different number of columns than the header.`);
  }

  return { headers, rows, errors };
}

export function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

export function normalizePhone(v: string): string {
  return (v || "").replace(/\D/g, "");
}

export function D2(v: string): boolean {
  if (v === "" || v == null) return true;
  const t = v.trim();
  if (t === "") return true;
  const n = Number(t);
  return Number.isFinite(n);
}

export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["\ufeff" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");
}

export function downloadTemplate(filename: string, headers: string[], sample?: (string | number)[]) {
  const rows = sample ? [sample] : [];
  downloadTextFile(filename, toCsv(headers, rows));
}

export function downloadErrorReport(filename: string, errors: { row: number; reason: string }[]) {
  const rows = errors.map((e) => [e.row, e.reason]);
  downloadTextFile(filename, toCsv(["row", "reason"], rows));
}
