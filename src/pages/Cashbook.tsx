import { useMemo, useState } from "react";
import { useDepot } from "../lib/store";
import { Card, Button, PageHeader, Modal, Field, Badge, EmptyState, useToast } from "../components/ui";
import { Icon } from "../components/Icons";
import { D, money, fmtDate } from "../lib/format";
import { createRecord, patchRecord, deleteRecord, byDateDesc } from "../lib/repo";
import { useAuth } from "../lib/auth";
import { useLang } from "../lib/lang";
import { cashCategoryLabel, dirLabel, methodLabel } from "../lib/labels";
import { exportCsv } from "../lib/print";

type Doc = Record<string, unknown>;
interface Form { id?: string; dir: "in" | "out"; category: string; amount: string; method: string; description: string; entry_date: string }

export default function Cashbook() {
  const d = useDepot();
  const { user } = useAuth();
  const toast = useToast();
  const { t } = useLang();
  const [form, setForm] = useState<Form | null>(null);
  const [dirF, setDirF] = useState("");
  const [methodF, setMethodF] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => byDateDesc(d.cashbook, "entry_date").filter((c) => {
    const day = String(c.business_date ?? "").slice(0, 10);
    if (dirF && String(c.dir) !== dirF) return false;
    if (methodF && String(c.method) !== methodF) return false;
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  }), [d.cashbook, dirF, methodF, from, to]);

  const totalIn = rows.filter((r) => String(r.dir) === "in").reduce((a, r) => a.plus(D(r.amount as string)), D(0));
  const totalOut = rows.filter((r) => String(r.dir) === "out").reduce((a, r) => a.plus(D(r.amount as string)), D(0));

  async function save(f: Form) {
    if (D(f.amount).lte(0)) { toast(t.invalidAmount, "danger"); return; }
    setBusy(true);
    try {
      const payload = { ref_no: `MAN-${Date.now().toString().slice(-6)}`, entry_date: f.entry_date, business_date: f.entry_date.slice(0, 10), dir: f.dir, category: f.category || "manual", amount: D(f.amount).toFixed(2), method: f.method, description: f.description, related_table: null, related_id: null, created_by: user?.uid ?? "web", version: 1, sync_status: "synced" };
      if (f.id) await patchRecord("cashbook", f.id, { amount: payload.amount, method: payload.method, description: payload.description, category: payload.category });
      else await createRecord("cashbook", payload, { createdBy: user?.uid });
      toast(f.id ? t.updated : t.entryCreated); setForm(null);
    } catch (e) { toast((e as Error).message, "danger"); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader eyebrow={t.all} title={t.cashbookTitle} description={t.cashbookDesc}>
        <Button variant="secondary" icon="download" onClick={() => exportCsv("cashbook", [
          { header: t.date, value: (r) => String(r.business_date) }, { header: t.direction, value: (r) => dirLabel(String(r.dir), t) },
          { header: t.category, value: (r) => cashCategoryLabel(String(r.category), t) }, { header: t.method, value: (r) => methodLabel(String(r.method), t) },
          { header: t.amount, value: (r) => String(r.amount) }, { header: t.ref, value: (r) => String(r.ref_no) },
        ], rows)}>CSV</Button>
        <Button variant="primary" icon="plus" onClick={() => setForm({ dir: "out", category: "manual", amount: "", method: "cash", description: "", entry_date: new Date().toISOString() })}>{t.newEntry}</Button>
      </PageHeader>

      <div className="op-metrics">
        <Card className="metric-card"><div className="metric-top"><span>{t.cashInHand}</span></div><strong>{money(d.cashInHand)}</strong></Card>
        <Card className="metric-card"><div className="metric-top"><span>{t.bankBalance}</span></div><strong>{money(d.bankBalance)}</strong></Card>
        <Card className="metric-card"><div className="metric-top"><span>{t.filteredIn}</span></div><strong>{money(totalIn)}</strong></Card>
        <Card className="metric-card"><div className="metric-top"><span>{t.filteredOut}</span></div><strong>{money(totalOut)}</strong></Card>
      </div>

      <Card className="filter-card">
        <div className="filter-search"><Icon name="search" size={15} /><input readOnly value={t.filterHint} /></div>
        <select className="filter-select" value={dirF} onChange={(e) => setDirF(e.target.value)}>
          <option value="">{t.allDirections}</option><option value="in">{t.dirs.in}</option><option value="out">{t.dirs.out}</option>
        </select>
        <select className="filter-select" value={methodF} onChange={(e) => setMethodF(e.target.value)}>
          <option value="">{t.allMethods}</option><option value="cash">{t.methods.cash}</option><option value="bank">{t.methods.bank}</option><option value="other">{t.methods.other}</option>
        </select>
        <input className="date-control latin" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="date-control latin" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </Card>

      <Card>
        <div className="card-head"><div><h2>{t.cashbookEntries}</h2><p>{rows.length} {t.entries}</p></div></div>
        {rows.length === 0 ? <EmptyState icon="wallet" title={t.noEntries} /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>{t.date}</th><th>{t.ref}</th><th>{t.category}</th><th>{t.direction}</th><th>{t.method}</th><th>{t.amount}</th><th>{t.description}</th><th></th></tr></thead>
            <tbody>
              {rows.slice(0, 300).map((c) => {
                const manual = String(c.related_table ?? "") === "" || String(c.related_table ?? "") === "null";
                return (
                  <tr key={String(c.id)}>
                    <td>{fmtDate(String(c.business_date))}</td>
                    <td className="latin">{String(c.ref_no)}</td>
                    <td>{cashCategoryLabel(String(c.category), t)}</td>
                    <td><Badge tone={String(c.dir) === "in" ? "success" : "danger"}>{dirLabel(String(c.dir), t)}</Badge></td>
                    <td>{methodLabel(String(c.method), t)}</td>
                    <td className="num">{money(c.amount as string)}</td>
                    <td>{String(c.description ?? "—")}</td>
                    <td>{manual && (
                      <div className="table-tools">
                        <button onClick={() => setForm({ id: String(c.id), dir: String(c.dir) as "in" | "out", category: String(c.category), amount: String(c.amount), method: String(c.method), description: String(c.description ?? ""), entry_date: String(c.entry_date) })} title={t.edit}><Icon name="file" size={13} /></button>
                        <button onClick={async () => { if (!confirm(t.deleteEntryConfirm)) return; try { await deleteRecord("cashbook", String(c.id)); toast(t.deleted); } catch (e) { toast((e as Error).message, "danger"); } }} title={t.delete}>×</button>
                      </div>
                    )}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </Card>

      {form && (
        <Modal title={form.id ? t.editEntry : t.newCashEntry} onClose={() => setForm(null)} footer={<>
          <Button onClick={() => setForm(null)}>{t.cancel}</Button>
          <Button variant="primary" disabled={busy} onClick={() => save(form)}>{t.save}</Button>
        </>}>
          <div className="form-grid">
            <Field label={t.direction}>
              <select value={form.dir} onChange={(e) => setForm({ ...form, dir: e.target.value as "in" | "out" })}><option value="in">{t.dirs.in}</option><option value="out">{t.dirs.out}</option></select>
            </Field>
            <Field label={t.method}>
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option value="cash">{t.methods.cash}</option><option value="bank">{t.methods.bank}</option><option value="other">{t.methods.other}</option></select>
            </Field>
            <Field label={t.amount}><input className="latin" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label={t.category}><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
            <Field label={t.date}><input className="latin" type="date" value={form.entry_date.slice(0, 10)} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></Field>
            <Field label={t.description} full><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}
