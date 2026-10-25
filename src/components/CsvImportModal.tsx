import { useMemo, useRef, useState } from "react";
import { Button, Modal, useToast } from "./ui";
import { Icon } from "./Icons";
import { normalizeHeader, downloadTemplate, downloadErrorReport } from "../lib/csv";
import { parseSpreadsheet, downloadExcelTemplate, SHEET_MAX_ROWS } from "../lib/sheet";
import { useLang } from "../lib/lang";

export interface CsvImportRow<T> {
  index: number; // 1-based data row number
  values: string[];
  record: Record<string, string>; // canonical header -> value
  parsed: T | null;
  errors: string[];
  duplicateOf: string | null; // existing id or "file:row"
}

export interface CsvImportConfig<T> {
  title: string;
  templateFilename: string;
  templateHeaders: string[]; // canonical headers, in the order shown in the preview
  templateSample?: (string | number)[];
  expectedHeaders: string[]; // same as templateHeaders (accepted for compatibility)
  requiredHeaders?: string[]; // subset that must be present
  /** normalized uploaded header -> canonical header (e.g. name -> customer_name). */
  headerAliases?: Record<string, string>;
  headerLabels: Record<string, string>; // normalized -> display
  validateRow: (values: Record<string, string>, rowIndex: number) => { ok: boolean; errors: string[]; data?: T };
  duplicateKey: (data: T) => string;
  existing: { id: string; [k: string]: unknown }[];
  existingDuplicateKey: (r: { id: string; [k: string]: unknown }) => string;
  onImport: (rows: T[], policy: "skip" | "import-new") => Promise<{ created: number; skipped: number }>;
}

export function CsvImportModal<T>({
  config, onClose,
}: { config: CsvImportConfig<T>; onClose: () => void }) {
  const toast = useToast();
  const { t } = useLang();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<CsvImportRow<T>[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [duplicatePolicy, setDuplicatePolicy] = useState<"skip" | "import-new">("skip");
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  async function handleFile(file: File) {
    setParsed(null);
    setParseErrors([]);
    setResult(null);
    setFileName(file.name);
    setParsing(true);
    try {
      const table = await parseSpreadsheet(file);
      const fatal = table.errors.filter((e) => !e.includes("different number of columns"));
      if (fatal.length) setParseErrors(fatal);

      if (table.headers.length === 0) {
        setParsed([]);
        return;
      }

      const expected = config.templateHeaders;
      const normHeaders = table.headers.map(normalizeHeader);
      const aliases = config.headerAliases ?? {};
      const cols = normHeaders
        .map((h, i) => ({ h, i, canonical: aliases[h] ?? h }))
        .filter((c) => c.h !== "");

      const required = config.requiredHeaders ?? expected;
      const missing = required.filter((h) => !cols.some((c) => c.canonical === h));
      const headerErrors: string[] = [];
      if (missing.length) {
        headerErrors.push(
          `${t.missingColumns}: ${missing.join(", ")}. ${t.expected}: ${expected.join(", ")}.`,
        );
      }
      if (headerErrors.length) {
        setParseErrors((p) => [...p, ...headerErrors]);
        setParsed([]);
        return;
      }

      if (table.rows.length > SHEET_MAX_ROWS) {
        setParseErrors([`${t.tooManyRows} ${SHEET_MAX_ROWS}.`]);
        setParsed([]);
        return;
      }

      // duplicate detection setup
      const existingKeys = new Map<string, string>();
      for (const r of config.existing) {
        const k = config.existingDuplicateKey(r);
        if (k) existingKeys.set(k, String(r.id));
      }
      const seenInFile = new Map<string, number>();

      const rows: CsvImportRow<T>[] = table.rows.map((vals, ri) => {
        const record: Record<string, string> = {};
        for (const c of cols) {
          if (record[c.canonical] === undefined) record[c.canonical] = (vals[c.i] ?? "").trim();
        }
        const obj: Record<string, string> = {};
        for (const h of expected) obj[h] = record[h] ?? "";
        const v = config.validateRow(obj, ri + 1);
        let dupOf: string | null = null;
        if (v.ok && v.data) {
          const k = config.duplicateKey(v.data);
          if (k) {
            if (existingKeys.has(k)) dupOf = existingKeys.get(k)!;
            else if (seenInFile.has(k)) dupOf = `file:${seenInFile.get(k)}`;
            else seenInFile.set(k, ri + 1);
          }
        }
        return {
          index: ri + 1,
          values: vals,
          record,
          parsed: v.ok ? (v.data as T) : null,
          errors: v.errors,
          duplicateOf: dupOf,
        };
      });
      setParsed(rows);
    } catch (e) {
      setParseErrors([(e as Error).message]);
      setParsed([]);
    } finally {
      setParsing(false);
    }
  }

  const stats = useMemo(() => {
    if (!parsed) return null;
    const total = parsed.length;
    const valid = parsed.filter((r) => r.parsed && !r.duplicateOf).length;
    const invalid = parsed.filter((r) => r.errors.length > 0).length;
    const dupes = parsed.filter((r) => r.duplicateOf).length;
    return { total, valid, invalid, dupes };
  }, [parsed]);

  const importable = useMemo(() => {
    if (!parsed) return [];
    const out: T[] = [];
    for (const r of parsed) {
      if (!r.parsed) continue;
      if (r.duplicateOf) {
        if (duplicatePolicy === "import-new") out.push(r.parsed);
        // skip otherwise
      } else {
        out.push(r.parsed);
      }
    }
    return out;
  }, [parsed, duplicatePolicy]);

  async function doImport() {
    if (importable.length === 0) {
      toast(t.noRecords, "danger");
      return;
    }
    setBusy(true);
    try {
      const res = await config.onImport(importable, duplicatePolicy);
      setResult(res);
      toast(`${t.importDone}: ${res.created} ${t.created}, ${res.skipped} ${t.skipped}`);
    } catch (e) {
      toast((e as Error).message, "danger");
    } finally {
      setBusy(false);
    }
  }

  function downloadErrors() {
    if (!parsed) return;
    const errs = parsed
      .filter((r) => r.errors.length > 0 || r.duplicateOf)
      .map((r) => ({
        row: r.index,
        reason: r.errors.length ? r.errors.join("; ") : `${t.duplicateOf} ${r.duplicateOf}`,
      }));
    downloadErrorReport("import-errors.csv", errs);
  }

  return (
    <Modal title={config.title} onClose={onClose} footer={
      <>
        <Button onClick={onClose}>{result ? t.closeWord : t.cancel}</Button>
        {!result && parsed && parsed.length > 0 && (
          <Button variant="primary" disabled={busy || importable.length === 0} onClick={doImport}>
            {busy ? t.importing : `${t.importN} (${importable.length})`}
          </Button>
        )}
      </>
    }>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Button variant="secondary" icon="download"
          onClick={() => downloadTemplate(config.templateFilename, config.templateHeaders, config.templateSample)}>
          {t.csvTemplate}
        </Button>
        <Button variant="secondary" icon="download"
          onClick={() => downloadExcelTemplate(
            config.templateFilename.replace(/\.csv$/i, ".xlsx"),
            config.templateHeaders,
            config.templateSample,
          )}>
          {t.excelTemplate}
        </Button>
        <Button variant="secondary" icon="upload" disabled={parsing} onClick={() => fileRef.current?.click()}>
          {parsing ? t.loading : t.uploadSheet}
        </Button>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} />
        {fileName && <span style={{ alignSelf: "center", fontSize: 12, color: "var(--slate-500)" }}>{fileName}</span>}
      </div>

      {parseErrors.length > 0 && (
        <div className="review-block" style={{ background: "var(--rose-50, #fef2f2)" }}>
          <span style={{ color: "var(--red)" }}>{t.parseErrors}</span>
          <ul style={{ margin: 4, paddingInlineStart: 18 }}>
            {parseErrors.map((e, i) => <li key={i} style={{ fontSize: 12 }}>{e}</li>)}
          </ul>
        </div>
      )}

      {result && (
        <div className="review-block">
          <span>{t.importComplete}</span>
          <strong>{result.created} {t.created}, {result.skipped} {t.skipped}</strong>
        </div>
      )}

      {parsed && parsed.length > 0 && !result && (
        <>
          <div className="reconcile-grid" style={{ marginBottom: 12 }}>
            <div><span>{t.totalRows}</span><strong>{stats?.total}</strong></div>
            <div><span>{t.validRows}</span><strong>{stats?.valid}</strong></div>
            <div><span>{t.invalidRows}</span><strong>{stats?.invalid}</strong></div>
            <div><span>{t.duplicateRows}</span><strong>{stats?.dupes}</strong></div>
          </div>

          {stats && stats.dupes > 0 && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>{t.duplicatePolicy}</label>
              <select value={duplicatePolicy} onChange={(e) => setDuplicatePolicy(e.target.value as "skip" | "import-new")} style={{ marginInlineStart: 8 }}>
                <option value="skip">{t.skipDuplicates}</option>
                <option value="import-new">{t.importDuplicates}</option>
              </select>
            </div>
          )}

          <p className="insight" style={{ marginBottom: 8 }}>
            <Icon name="sync" size={14} /> {t.importSheetHint}
          </p>

          <div style={{ marginBottom: 8 }}>
            <Button variant="ghost" icon="download" onClick={downloadErrors} disabled={!parsed.some((r) => r.errors.length || r.duplicateOf)}>
              {t.downloadErrorReport}
            </Button>
          </div>

          <div className="table-scroll" style={{ maxHeight: 320 }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  {config.templateHeaders.map((h) => <th key={h}>{config.headerLabels[h] ?? h}</th>)}
                  <th>{t.statusHeader}</th>
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 200).map((r) => (
                  <tr key={r.index}>
                    <td>{r.index}</td>
                    {config.templateHeaders.map((h) => (
                      <td key={h}>{r.record[h] ?? ""}</td>
                    ))}
                    <td>
                      {r.errors.length > 0 ? (
                        <span style={{ color: "var(--red)", fontSize: 11 }}>{r.errors.join("; ")}</span>
                      ) : r.duplicateOf ? (
                        <span style={{ color: "var(--amber, #b45309)", fontSize: 11 }}>{t.duplicateOf} ({r.duplicateOf})</span>
                      ) : (
                        <span style={{ color: "var(--green)", fontSize: 11 }}>{t.validRow}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.length > 200 && <p style={{ fontSize: 12, padding: 8 }}>{t.showingFirstRows}</p>}
          </div>
        </>
      )}

      {!parsed && !parseErrors.length && !parsing && (
        <p className="center" style={{ padding: 24, color: "var(--slate-500)" }}>
          {t.noFileYet}
        </p>
      )}
    </Modal>
  );
}
