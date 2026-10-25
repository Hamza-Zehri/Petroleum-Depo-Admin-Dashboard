import { useMemo, useState } from "react";
import { useDepot } from "../lib/store";
import { Card, Button, PageHeader, Modal, Field, StatusBadge, EmptyState, useToast } from "../components/ui";
import { Icon } from "../components/Icons";
import { D, money, fmtDate } from "../lib/format";
import { patchRecord, deleteRecord, byDateDesc } from "../lib/repo";
import { postExpense, reverseTransaction } from "../lib/posting";
import { useAuth } from "../lib/auth";
import { useLang } from "../lib/lang";
import { EXPENSE_CATEGORY_OPTIONS, categoryLabel, methodLabel } from "../lib/labels";
import { exportCsv } from "../lib/print";

type Doc = Record<string, unknown>;
interface Form { category: string; amount: string; expense_date: string; description: string; method: string }

export default function Expenses() {
  const d = useDepot();
  const { user } = useAuth();
  const toast = useToast();
  const { t } = useLang();
  const [form, setForm] = useState<Form | null>(null);
  const [methodF, setMethodF] = useState("");
  const [catF, setCatF] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => byDateDesc(d.expenses, "expense_date").filter((e) =>
    (!methodF || String(e.method) === methodF) && (!catF || String(e.category) === catF)),
    [d.expenses, methodF, catF]);

  const total = rows.reduce((a, r) => a.plus(D(r.amount as string)), D(0));

  async function save(f: Form) {
    if (D(f.amount).lte(0)) { toast(t.invalidAmount, "danger"); return; }
    setBusy(true);
    try {
      await postExpense({ category: f.category, amount: f.amount, expense_date: f.expense_date, description: f.description, method: f.method, actor: user?.uid ?? "web" });
      toast(t.expensePosted); setForm(null);
    } catch (e) { toast((e as Error).message, "danger"); } finally { setBusy(false); }
  }

  const totalsByCat = useMemo(() => {
    const m = new Map<string, ReturnType<typeof D>>();
    for (const e of d.expenses) m.set(String(e.category), (m.get(String(e.category)) ?? D(0)).plus(D(e.amount as string)));
    return [...m.entries()].sort((a, b) => b[1].comparedTo(a[1])).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.expenses]);
  const maxCat = totalsByCat.reduce((m, [, v]) => Math.max(m, v.toNumber()), 0) || 1;

  return (
    <>
      <PageHeader eyebrow={t.all} title={t.expensesTitle} description={t.expensesDesc}>
        <Button variant="secondary" icon="download" onClick={() => exportCsv("expenses", [
          { header: t.date, value: (r) => String(r.expense_date) }, { header: t.category, value: (r) => categoryLabel(String(r.category), t) },
          { header: t.amount, value: (r) => String(r.amount) }, { header: t.method, value: (r) => methodLabel(String(r.method), t) },
          { header: t.description, value: (r) => String(r.description ?? "") },
        ], rows)}>CSV</Button>
        <Button variant="primary" icon="plus" onClick={() => setForm({ category: EXPENSE_CATEGORY_OPTIONS[0].value, amount: "", expense_date: new Date().toISOString().slice(0, 10), description: "", method: "cash" })}>{t.newExpense}</Button>
      </PageHeader>

      <div className="pnl-layout" style={{ marginBottom: 14 }}>
        <Card>
          <div className="card-head"><div><h2>{t.expensesByCategory}</h2><p>{t.byTotal}</p></div></div>
          {totalsByCat.length === 0 ? <EmptyState icon="download" title={t.noExpenses} /> : totalsByCat.map(([cat, v]) => (
            <div key={cat} style={{ margin: "12px 0" }}>
              <div className="tank-line" style={{ margin: "0 0 6px" }}>
                <div className="tank-name"><div><strong>{categoryLabel(cat, t)}</strong></div></div>
                <div className="tank-amount"><strong>{money(v)}</strong></div>
              </div>
              <div className="progress-track"><span className="progress-fill fill-warning" style={{ width: `${(v.toNumber() / maxCat) * 100}%` }} /></div>
            </div>
          ))}
        </Card>
        <Card>
          <div className="card-head"><div><h2>{t.totalExpenses}</h2><p>{t.currentFilter}</p></div></div>
          <div className="tank-stock"><span>{t.amount}</span><strong>{money(total)}</strong><small>{rows.length} {t.entries}</small></div>
          <p className="insight"><Icon name="alert" size={14} /> {t.expensesAutoCashbook}</p>
        </Card>
      </div>

      <Card className="filter-card">
        <select className="filter-select" value={catF} onChange={(e) => setCatF(e.target.value)}>
          <option value="">{t.allCategories}</option>{EXPENSE_CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{t.categories[c.key]}</option>)}
        </select>
        <select className="filter-select" value={methodF} onChange={(e) => setMethodF(e.target.value)}>
          <option value="">{t.allMethods}</option><option value="cash">{t.methods.cash}</option><option value="bank">{t.methods.bank}</option><option value="other">{t.methods.other}</option>
        </select>
      </Card>

      <Card>
        <div className="card-head"><div><h2>{t.expenses}</h2><p>{rows.length} {t.entries}</p></div></div>
        {rows.length === 0 ? <EmptyState icon="download" title={t.noExpenses} /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>{t.date}</th><th>{t.ref}</th><th>{t.category}</th><th>{t.method}</th><th>{t.amount}</th><th>{t.description}</th><th>{t.statusHeader}</th><th></th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={String(e.id)}>
                  <td>{fmtDate(String(e.expense_date))}</td>
                  <td className="latin">{String(e.ref_no)}</td>
                  <td>{categoryLabel(String(e.category), t)}</td>
                  <td>{methodLabel(String(e.method), t)}</td>
                  <td className="num">{money(e.amount as string)}</td>
                  <td>{String(e.description ?? "—")}</td>
                  <td><StatusBadge status={String(e.status)} /></td>
                  <td>
                    <div className="table-tools">
                      <button onClick={async () => {
                        const reason = prompt(t.reverseReason) ?? ""; if (!reason) return;
                        try { await reverseTransaction({ entity: "expenses", id: String(e.id), reason, actor: user?.uid ?? "web" }); toast(t.reversedToast); }
                        catch (er) { toast((er as Error).message, "danger"); }
                      }} title={t.reverse}><Icon name="alert" size={13} /></button>
                      <button onClick={async () => { if (!confirm(t.confirmDeleteExpense)) return; try { await deleteRecord("expenses", String(e.id)); toast(t.deleted); } catch (er) { toast((er as Error).message, "danger"); } }} title={t.delete}>×</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      {form && (
        <Modal title={t.newExpense} onClose={() => setForm(null)} footer={<>
          <Button onClick={() => setForm(null)}>{t.cancel}</Button>
          <Button variant="primary" disabled={busy} onClick={() => save(form)}>{t.confirmAndPost}</Button>
        </>}>
          <div className="form-grid">
            <Field label={t.category}>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{EXPENSE_CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{t.categories[c.key]}</option>)}</select>
            </Field>
            <Field label={t.amount}><input className="latin" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label={t.date}><input className="latin" type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></Field>
            <Field label={t.method}>
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option value="cash">{t.methods.cash}</option><option value="bank">{t.methods.bank}</option><option value="other">{t.methods.other}</option></select>
            </Field>
            <Field label={t.description} full><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}
