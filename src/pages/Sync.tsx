import { useMemo } from "react";
import { useDepot } from "../lib/store";
import { Card, Button, PageHeader, Badge, EmptyState } from "../components/ui";
import { Icon } from "../components/Icons";
import { fmtDateTime } from "../lib/format";
import { useCollection, byDateDesc } from "../lib/repo";

type Doc = Record<string, unknown>;

export default function Sync() {
  const d = useDepot();
  const { data: devices } = useCollection<Doc>("devices", [], ["devices-all"]);

  const all = useMemo(() => [
    ...d.sales, ...d.purchases, ...d.customerPayments, ...d.supplierPayments,
    ...d.expenses, ...d.stockLedger, ...d.cashbook, ...d.tankDips, ...d.dailyClosings,
  ], [d.sales, d.purchases, d.customerPayments, d.supplierPayments, d.expenses, d.stockLedger, d.cashbook, d.tankDips, d.dailyClosings]);

  const counts = useMemo(() => {
    const c = { synced: 0, pending: 0, syncing: 0, failed: 0, conflict: 0 };
    for (const r of all) {
      const s = String(r.sync_status ?? "synced") as keyof typeof c;
      if (s in c) c[s]++; else c.synced++;
    }
    return c;
  }, [all]);

  const lastActivity = useMemo(() => {
    const ts = all.map((r) => String(r.updated_at ?? r.created_at ?? r.entry_time ?? "")).filter(Boolean).sort();
    return ts.length ? ts[ts.length - 1] : "";
  }, [all]);

  const conflicts = all.filter((r) => String(r.sync_status) === "conflict");

  return (
    <>
      <PageHeader eyebrow="ڈپو" title="سنک اور ڈیوائسز" description="فون اور کلاؤڈ کے درمیان ڈیٹا کی مطابقت">
        <Button variant="secondary" icon="sync" onClick={() => location.reload()}>ریفریش</Button>
      </PageHeader>

      <div className="op-metrics">
        <Card className="metric-card"><div className="metric-top"><span>کل ریکارڈ</span></div><strong>{all.length}</strong></Card>
        <Card className="metric-card"><div className="metric-top"><span>سنک شدہ</span><Icon name="check" size={16} /></div><strong>{counts.synced}</strong></Card>
        <Card className="metric-card"><div className="metric-top"><span>زیرِ التوا / ناکام</span><Icon name="alert" size={16} /></div><strong>{counts.pending + counts.failed + counts.syncing}</strong></Card>
        <Card className="metric-card"><div className="metric-top"><span>تنازع</span><Icon name="alert" size={16} /></div><strong>{counts.conflict}</strong></Card>
      </div>

      <div className="dashboard-grid">
        <Card>
          <div className="card-head"><div><h2>کنکشن اسٹیٹس</h2><p>Firestore کلاؤڈ</p></div></div>
          <div className="server-status" style={{ color: "var(--slate-700)" }}>
            <span className="pulse" style={{ background: navigator.onLine ? "#2ad49b" : "#e49419" }} />
            <div><strong>{navigator.onLine ? "آن لائن — جڑا ہوا" : "آف لائن"}</strong><span style={{ fontSize: 11, color: "var(--slate-500)" }}>آخری اپ ڈیٹ: {fmtDateTime(lastActivity) || "—"}</span></div>
          </div>
          <p className="insight" style={{ marginTop: 12 }}><Icon name="sync" size={14} /> فون آف لائن ہونے پر SQLite میں محفوظ کرتا ہے اور آن لائن ہوتے ہی Firestore پر بھیج دیتا ہے۔ یہاں صرف مطابقت پذیر ڈیٹا نظر آتا ہے۔</p>
        </Card>

        <Card>
          <div className="card-head"><div><h2>رجسٹر شدہ ڈیوائسز</h2><p>{devices.length} ڈیوائس</p></div></div>
          {devices.length === 0 ? <EmptyState icon="device" title="کوئی ڈیوائس نہیں" /> : (
            <div className="table-scroll"><table>
              <thead><tr><th>نام</th><th>کردار</th><th>رجسٹر</th><th>آخری رابطہ</th></tr></thead>
              <tbody>{byDateDesc(devices, "registered_at").map((dev) => (
                <tr key={String(dev.id)}>
                  <td>{String(dev.name ?? dev.id)}</td>
                  <td>{String(dev.role ?? "—")}</td>
                  <td>{fmtDateTime(String(dev.registered_at ?? ""))}</td>
                  <td>{fmtDateTime(String(dev.last_seen ?? ""))}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>

        <Card>
          <div className="card-head"><div><h2>تنازعات</h2><p>دستی جائزہ درکار</p></div></div>
          {conflicts.length === 0 ? <p className="insight"><Icon name="check" size={14} /> کوئی تنازع نہیں۔</p> : (
            <div className="table-scroll"><table>
              <thead><tr><th>حوالہ</th><th>آخری اپ ڈیٹ</th></tr></thead>
              <tbody>{conflicts.slice(0, 20).map((c) => (<tr key={String(c.id)}><td className="latin">{String(c.ref_no ?? c.id)}</td><td>{fmtDateTime(String(c.updated_at ?? ""))}</td></tr>))}</tbody>
            </table></div>
          )}
          <div style={{ marginTop: 12 }}><Badge tone={counts.conflict ? "danger" : "success"}>{counts.conflict ? `${counts.conflict} تنازع` : "سب درست"}</Badge></div>
        </Card>
      </div>
    </>
  );
}
