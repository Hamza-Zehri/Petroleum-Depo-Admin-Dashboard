import { useMemo, useRef, useState } from "react";
import { collection, doc, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Card, Button, PageHeader, Modal, EmptyState, useToast } from "../components/ui";
import { Icon } from "../components/Icons";
import { useDepot } from "../lib/store";
import { useLang } from "../lib/lang";
import { useAuth } from "../lib/auth";
import { COLLECTIONS } from "../lib/types";
import { ADMIN_DEVICE_ID, createRecord, deleteRecord, useCollection } from "../lib/repo";
import { fmtDateTime } from "../lib/format";

type Doc = Record<string, unknown>;
type Snapshot = Doc & { data?: Record<string, unknown> };

export default function Backups() {
  const d = useDepot();
  const toast = useToast();
  const { t } = useLang();
  const { user } = useAuth();
  const snapshots = useCollection<Snapshot>("backups", [], ["backups-live"]);

  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<Snapshot | null>(null);
  const [importing, setImporting] = useState(false);

  const counts = useMemo<Record<string, number>>(() => ({
    sales: d.sales.length, purchases: d.purchases.length, customers: d.customers.length,
    suppliers: d.suppliers.length, cashbook: d.cashbook.length, stock_ledger: d.stockLedger.length,
    expenses: d.expenses.length, daily_closings: d.dailyClosings.length,
  }), [d]);

  async function buildDump(): Promise<{ dump: Record<string, unknown>; total: number }> {
    const dump: Record<string, unknown> = {};
    const countsOut: Record<string, number> = {};
    let total = 0;
    for (const name of Object.values(COLLECTIONS)) {
      const snap = await getDocs(collection(db, name));
      dump[name] = snap.docs.map((x) => ({ id: x.id, ...x.data() }));
      countsOut[name] = snap.size;
      total += snap.size;
    }
    dump.__meta = { exported_at: new Date().toISOString(), project: "petroleum-depot", counts: countsOut };
    return { dump, total };
  }

  async function exportAll() {
    try {
      const { dump, total } = await buildDump();
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `petroleum-depot-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast(`${t.backupsDownloaded} · ${total} ${t.backupsRecords}`);
    } catch (e) { toast((e as Error).message, "danger"); }
  }

  async function createSnapshot() {
    setCreating(true);
    try {
      const { dump, total } = await buildDump();
      const json = JSON.stringify(dump);
      const size = new Blob([json]).size;
      if (size > 900 * 1024) {
        toast(t.backupsTooLarge, "danger");
        return;
      }
      await createRecord("backups", {
        label: label.trim() || `snapshot-${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
        created_at: new Date().toISOString(),
        schema_version: 1,
        records: total,
        size,
        data: dump,
        created_by: user?.uid ?? "ADMIN",
      }, { createdBy: user?.uid });
      setLabel("");
      toast(t.backupsSnapshotCreated);
    } catch (e) {
      toast((e as Error).message, "danger");
    } finally {
      setCreating(false);
    }
  }

  async function applyDump(dump: Record<string, unknown>) {
    let total = 0;
    for (const name of Object.values(COLLECTIONS)) {
      const docs = dump[name] as Record<string, unknown>[] | undefined;
      if (!Array.isArray(docs)) continue;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db);
        for (const d0 of docs.slice(i, i + 400)) {
          const id = String(d0.id);
          const version = typeof d0.version === "number" ? d0.version + 1 : 1;
          const now = new Date().toISOString();
          batch.set(doc(db, name, id), {
            ...d0,
            id,
            version,
            updated_at: now,
            updatedAt: now,
            device_id: ADMIN_DEVICE_ID,
            deviceId: ADMIN_DEVICE_ID,
            _updatedAt: serverTimestamp(),
          }, { merge: true });
          total++;
        }
        await batch.commit();
      }
    }
    return total;
  }

  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(f: File) {
    if (!confirm(t.backupsRestoreConfirm)) return;
    setImporting(true);
    try {
      const text = await f.text();
      const data = JSON.parse(text) as Record<string, unknown>;
      const total = await applyDump(data);
      toast(`${total} ${t.backupsRestored}`);
    } catch (e) { toast((e as Error).message, "danger"); } finally { setImporting(false); }
  }

  async function restoreSnapshot(s: Snapshot) {
    if (!s.data || !confirm(t.backupsRestoreConfirm)) return;
    setImporting(true);
    try {
      const total = await applyDump(s.data as Record<string, unknown>);
      toast(`${total} ${t.backupsRestored}`);
      setViewing(null);
    } catch (e) {
      toast((e as Error).message, "danger");
    } finally {
      setImporting(false);
    }
  }

  async function removeSnapshot(s: Snapshot) {
    if (!confirm(t.backupsDeleteConfirm)) return;
    try {
      await deleteRecord("backups", String(s.id));
      if (viewing && viewing.id === s.id) setViewing(null);
      toast(t.deleted);
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  function downloadSnapshot(s: Snapshot) {
    const blob = new Blob([JSON.stringify(s.data ?? s, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `petroleum-depot-${String(s.label ?? s.id).replace(/[^\w.-]+/g, "-")}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  const collections = useMemo(() => Object.entries(COLLECTIONS).map(([k, v]) => ({ k, v })), []);

  return (
    <>
      <PageHeader eyebrow={t.all} title={t.backupsTitle} description={t.backupsDesc}>
        <Button variant="primary" icon="download" onClick={exportAll}>{t.backupsFullExport}</Button>
      </PageHeader>

      <div className="dashboard-grid">
        <Card>
          <div className="card-head"><div><h2>{t.backupsExport}</h2><p>{t.backupsExportDesc}</p></div></div>
          <p className="insight"><Icon name="shield" size={14} /> {t.backupsExportDesc}</p>
          <div className="card-actions"><Button variant="primary" icon="download" onClick={exportAll}>{t.download}</Button></div>
        </Card>

        <Card>
          <div className="card-head"><div><h2>{t.backupsRestoreFile}</h2><p>{t.backupsRestoreFileDesc}</p></div></div>
          <div className="notice warning"><Icon name="alert" /><div><strong>{t.review}</strong><span>{t.backupsRestoreWarning}</span></div></div>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
          <div className="card-actions"><Button icon="sync" disabled={importing} onClick={() => fileRef.current?.click()}>{importing ? t.backupsRestoring : t.backupsChooseFile}</Button></div>
        </Card>

        <Card>
          <div className="card-head"><div><h2>{t.backupsDataSize}</h2><p>{t.backupsCount}</p></div></div>
          <div className="table-scroll"><table><tbody>
            {[["sales", d.sales.length], ["purchases", d.purchases.length], ["customers", d.customers.length], ["suppliers", d.suppliers.length], ["stock_ledger", d.stockLedger.length], ["cashbook", d.cashbook.length], ["expenses", d.expenses.length], ["daily_closings", d.dailyClosings.length]].map(([k, v]) => (
              <tr key={String(k)}><td className="latin">{String(k)}</td><td className="num">{String(v)}</td></tr>
            ))}
          </tbody></table></div>
        </Card>
      </div>

      <Card>
        <div className="card-head">
          <div><h2>{t.backupsViewerTitle}</h2><p>{t.backupsViewerDesc}</p></div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t.backupsLabel}
              style={{ minWidth: 180 }}
            />
            <Button variant="primary" icon="shield" disabled={creating} onClick={createSnapshot}>
              {creating ? t.backupsCreating : t.backupsCreate}
            </Button>
          </div>
        </div>

        {snapshots.error ? (
          <div className="notice warning"><Icon name="alert" /><div><strong>{t.parseErrors}</strong><span>{snapshots.error}</span></div></div>
        ) : snapshots.data.length === 0 ? (
          <EmptyState icon="shield" title={t.backupsNoSnapshots} hint={t.backupsNoSnapshotsHint} />
        ) : (
          <div className="table-scroll"><table>
            <thead>
              <tr>
                <th>{t.backupsLabel}</th><th>{t.backupsCreatedAt}</th>
                <th>{t.backupsRecords}</th><th>{t.backupsSize}</th><th></th>
              </tr>
            </thead>
            <tbody>{[...snapshots.data]
              .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
              .map((s) => {
                const data = (s.data ?? {}) as Record<string, unknown>;
                const recordCount = typeof s.records === "number"
                  ? s.records
                  : Object.values(data).reduce<number>((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
                const size = typeof s.size === "number" ? s.size : JSON.stringify(data).length;
                return (
                  <tr key={String(s.id)}>
                    <td>{String(s.label ?? s.id)}</td>
                    <td>{fmtDateTime(String(s.created_at ?? ""))}</td>
                    <td className="num">{recordCount}</td>
                    <td className="num">{(size / 1024).toFixed(1)} KB</td>
                    <td>
                      <div className="table-tools">
                        <button onClick={() => setViewing(s)} title={t.backupsView}><Icon name="file" size={13} /></button>
                        <button onClick={() => downloadSnapshot(s)} title={t.download}><Icon name="download" size={13} /></button>
                        <button onClick={() => restoreSnapshot(s)} title={t.backupsRestore}><Icon name="sync" size={13} /></button>
                        <button onClick={() => removeSnapshot(s)} title={t.backupsDelete}>×</button>
                      </div>
                    </td>
                  </tr>
                );
              })}</tbody>
          </table></div>
        )}
      </Card>

      <Card>
        <div className="card-head"><div><h2>{t.backupsCollections}</h2><p>{t.backupsCollectionName}</p></div></div>
        <div className="table-scroll"><table>
          <thead><tr><th>{t.backupsKey}</th><th>{t.backupsCollectionName}</th><th>{t.backupsCount}</th></tr></thead>
          <tbody>{collections.map(({ k, v }) => (
            <tr key={k}><td>{k}</td><td className="latin">{v}</td><td className="num">{(counts as Record<string, number>)[v] ?? "—"}</td></tr>
          ))}</tbody>
        </table></div>
      </Card>

      {viewing && (
        <Modal
          title={`${t.backupsSnapshot} — ${String(viewing.label ?? viewing.id)}`}
          onClose={() => setViewing(null)}
          footer={<>
            <Button onClick={() => setViewing(null)}>{t.close}</Button>
            <Button icon="download" onClick={() => downloadSnapshot(viewing)}>{t.download}</Button>
            <Button variant="primary" icon="sync" disabled={importing} onClick={() => restoreSnapshot(viewing)}>
              {importing ? t.backupsRestoring : t.backupsRestore}
            </Button>
          </>}
        >
          <div className="notice warning"><Icon name="alert" /><div><strong>{t.review}</strong><span>{t.backupsRestoreWarning}</span></div></div>
          <p className="insight" style={{ marginBottom: 8 }}>
            {t.backupsRecords}: {String(viewing.records ?? "—")} · {t.backupsSize}: {((Number(viewing.size) || 0) / 1024).toFixed(1)} KB
          </p>
          <div className="table-scroll" style={{ maxHeight: 420 }}>
            <pre style={{ direction: "ltr", textAlign: "left", fontSize: 11, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(viewing.data ?? {}, null, 2).slice(0, 200_000)}
            </pre>
          </div>
        </Modal>
      )}
    </>
  );
}
