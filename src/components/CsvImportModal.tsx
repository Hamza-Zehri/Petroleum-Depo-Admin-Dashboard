import { useMemo, useRef, useState } from "react";
import { Card, Button, Modal, Field, useToast } from "./ui";
import { Icon } from "./Icons";
import { parseCsv, normalizeHeader, normalizePhone, D2, downloadTemplate, downloadErrorReport, CSV_MAX_BYTES, CSV_MAX_ROWS } from "../lib/csv";

export interface CsvImportRow<T> {
  index: number; // 1-based data row number
  values: string[];
  parsed: T | null;
  errors: string[];
  duplicateOf: string | null; // existing id or "file:row"
}

export interface CsvImportConfig<T> {
  title: string;
  templateFilename: string;
  templateHeaders: string[];
  templateSample?: (string | number)[];
  expectedHeaders: string[]; // normalized (lowercase snake)
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<CsvImportRow<T>[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [duplicatePolicy, setDuplicatePolicy] = useState<"skip" | "import-new">("skip");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  const headersOk = useMemo(() => {
    if (!parsed) return true;
    // validated during parse
    return true;
  }, [parsed]);

  function handleFile(file: File) {
    setParsed(null);
    setParseErrors([]);
    setResult(null);
    if (file.size > CSV_MAX_BYTES) {
      setParseErrors([`File too large (max ${CSV_MAX_BYTES / 1024 / 1024} MB).`]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const table = parseCsv(text);
      if (table.errors.length) setParseErrors(table.errors);
      // validate headers
      const norm = table.headers.map(normalizeHeader);
      const expected = config.expectedHeaders;
      const headerErrors: string[] = [];
      if (norm.length !== expected.length) {
        headerErrors.push(`Expected ${expected.length} columns, found ${norm.length}.`);
      }
      for (let i = 0; i < expected.length; i++) {
        if (norm[i] && norm[i] !== expected[i]) {
          headerErrors.push(`Column ${i + 1}: expected "${expected[i]}", found "${norm[i]}".`);
        }
      }
      if (headerErrors.length) {
        setParseErrors((p) => [...p, ...headerErrors]);
        // still attempt? no
        setParsed([]);
        return;
      }
      if (table.rows.length > CSV_MAX_ROWS) {
        setParseErrors([`Too many rows (max ${CSV_MAX_ROWS}).`]);
        setParsed([]);
        return;
      }
      // Build normalized header index
      const idx: Record<string, number> = {};
      expected.forEach((h, i) => { idx[h] = i; });

      // duplicate detection setup
      const existingKeys = new Map<string, string>();
      for (const r of config.existing) {
        const k = config.existingDuplicateKey(r);
        if (k) existingKeys.set(k, String(r.id));
      }
      const seenInFile = new Map<string, number>();

      const rows: CsvImportRow<T>[] = table.rows.map((vals, ri) => {
        const obj: Record<string, string> = {};
        for (const h of expected) {
          obj[h] = (vals[idx[h]] ?? "").trim();
        }
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
        return { index: ri + 1, values: vals, parsed: v.ok ? (v.data as T) : null, errors: v.errors, duplicateOf: dupOf };
      });
      setParsed(rows);
    };
    reader.readAsText(file, "UTF-8");
    setFileName(file.name);
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
    if (importable.length === 0) { toast("UcU^O�UO U_OO3 U+OU. U?UOU� U?U' import UcO�UOU�", "danger"); return; }
    setBusy(true);
    try {
      const res = await config.onImport(importable, duplicatePolicy);
      setResult(res);
      toast(`Import U?O1OU,: ${res.created} U'OU.U,, ${res.skipped} skip`);
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
        reason: r.errors.length ? r.errors.join("; ") : `Duplicate of ${r.duplicateOf}`,
      }));
    downloadErrorReport("import-errors.csv", errs);
  }

  return (
    <Modal title={config.title} onClose={onClose} footer={
      <>
        <Button onClick={onClose}>{result ? "Close" : "Cancel"}</Button>
        {!result && parsed && parsed.length > 0 && (
          <Button variant="primary" disabled={busy || importable.length === 0} onClick={doImport}>
            {busy ? "Import UcO�UOU�..." : `Import (${importable.length})`}
          </Button>
        )}
      </>
    }>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Button variant="secondary" icon="download" onClick={() => downloadTemplate(config.templateFilename, config.templateHeaders, config.templateSample)}>
          Download template
        </Button>
        <Button variant="secondary" icon="upload" onClick={() => fileRef.current?.click()}>
          Upload CSV
        </Button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
        {fileName && <span style={{ alignSelf: "center", fontSize: 12, color: "var(--slate-500)" }}>{fileName}</span>}
      </div>

      {parseErrors.length > 0 && (
        <div className="review-block" style={{ background: "var(--rose-50, #fef2f2)" }}>
          <span style={{ color: "var(--red)" }}>Parse errors</span>
          <ul style={{ margin: 4, paddingLeft: 18 }}>
            {parseErrors.map((e, i) => <li key={i} style={{ fontSize: 12 }}>{e}</li>)}
          </ul>
        </div>
      )}

      {result && (
        <div className="review-block">
          <span>Import complete</span>
          <strong>{result.created} created, {result.skipped} skipped</strong>
        </div>
      )}

      {parsed && parsed.length > 0 && !result && (
        <>
          <div className="reconcile-grid" style={{ marginBottom: 12 }}>
            <div><span>Total rows</span><strong>{stats?.total}</strong></div>
            <div><span>Valid</span><strong>{stats?.valid}</strong></div>
            <div><span>Invalid</span><strong>{stats?.invalid}</strong></div>
            <div><span>Duplicates</span><strong>{stats?.dupes}</strong></div>
          </div>

          {stats && stats.dupes > 0 && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Duplicate policy</label>
              <select value={duplicatePolicy} onChange={(e) => setDuplicatePolicy(e.target.value as "skip" | "import-new")} style={{ marginLeft: 8 }}>
                <option value="skip">Skip duplicates</option>
                <option value="import-new">Import duplicates as new records</option>
              </select>
            </div>
          )}

          <div style={{ marginBottom: 8 }}>
            <Button variant="ghost" icon="download" onClick={downloadErrors} disabled={!parsed.some((r) => r.errors.length || r.duplicateOf)}>
              Download error report
            </Button>
          </div>

          <div className="table-scroll" style={{ maxHeight: 320 }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  {config.expectedHeaders.map((h) => <th key={h}>{config.headerLabels[h] ?? h}</th>)}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 200).map((r) => (
                  <tr key={r.index}>
                    <td>{r.index}</td>
                    {config.expectedHeaders.map((h, i) => {
                      const pos = config.expectedHeaders.indexOf(h);
                      // find value by header index in parsed row values (raw)
                      return <td key={h}>{r.values[pos] ?? ""}</td>;
                    })}
                    <td>
                      {r.errors.length > 0 ? (
                        <span style={{ color: "var(--red)", fontSize: 11 }}>{r.errors.join("; ")}</span>
                      ) : r.duplicateOf ? (
                        <span style={{ color: "var(--amber, #b45309)", fontSize: 11 }}>Duplicate ({r.duplicateOf})</span>
                      ) : (
                        <span style={{ color: "var(--green)", fontSize: 11 }}>Valid</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.length > 200 && <p style={{ fontSize: 12, padding: 8 }}>Showing first 200 of {parsed.length} rows.</p>}
          </div>
        </>
      )}

      {!parsed && !parseErrors.length && (
        <p className="center" style={{ padding: 24, color: "var(--slate-500)" }}>
          Download the template, fill it in, then upload the CSV file to preview and import.
        </p>
      )}
    </Modal>
  );
}
