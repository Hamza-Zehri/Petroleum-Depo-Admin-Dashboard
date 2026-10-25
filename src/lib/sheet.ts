// Spreadsheet ingestion for the bulk importer.
//
// CSV files are parsed by the dependency-free `parseCsv` helper (so quoted
// fields, commas and CRLF all behave). Excel workbooks (.xlsx / .xls) are read
// with SheetJS and normalised into exactly the same `CsvTable` shape, which
// means the preview / validation / batch-write pipeline is shared by both.
import * as XLSX from "xlsx";
import { parseCsv, toCsv, type CsvTable } from "./csv";

export const SHEET_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const SHEET_MAX_ROWS = 5000;

export function isExcelFile(file: File): boolean {
  const n = file.name.toLowerCase();
  return n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".xlsm");
}

/** Convert a worksheet matrix into the shared headers + rows contract. */
function matrixToTable(matrix: unknown[][]): CsvTable {
  const cleaned = matrix.map((row) =>
    (row ?? []).map((v) => (v == null ? "" : String(v).trim())),
  );
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].every((c) => c === "")) {
    cleaned.pop();
  }
  if (cleaned.length === 0) {
    return { headers: [], rows: [], errors: ["No data rows found."] };
  }
  const headers = cleaned[0];
  const rows = cleaned.slice(1).filter((r) => r.some((c) => c !== ""));
  if (rows.length === 0) {
    return { headers, rows: [], errors: ["No data rows found."] };
  }
  const errors: string[] = [];
  if (rows.length > SHEET_MAX_ROWS) {
    errors.push(`Too many rows (max ${SHEET_MAX_ROWS}).`);
  }
  return { headers, rows, errors };
}

/** Parse either a CSV or an Excel file into a uniform table. */
export async function parseSpreadsheet(file: File): Promise<CsvTable> {
  if (file.size > SHEET_MAX_BYTES) {
    return {
      headers: [],
      rows: [],
      errors: [`File too large (max ${SHEET_MAX_BYTES / 1024 / 1024} MB).`],
    };
  }
  if (isExcelFile(file)) {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const first = wb.SheetNames[0];
      if (!first) {
        return { headers: [], rows: [], errors: ["The workbook has no sheets."] };
      }
      const ws = wb.Sheets[first];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      });
      return matrixToTable(matrix);
    } catch (e) {
      return {
        headers: [],
        rows: [],
        errors: [`Could not read the workbook: ${(e as Error).message}`],
      };
    }
  }
  const text = await file.text();
  return parseCsv(text);
}

/** Download a ready-to-fill Excel workbook (header row only). */
export function downloadExcelTemplate(
  filename: string,
  headers: string[],
  sample?: (string | number)[],
) {
  const rows = sample ? [headers, sample] : [headers];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(14, String(h).length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Import");
  XLSX.writeFile(wb, filename, { compression: true });
}

/** Download an error report as CSV (same format as the CSV importer). */
export function downloadRowsCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const blob = new Blob(["\ufeff" + toCsv(headers, rows)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
