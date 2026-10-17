import { useMemo, useState } from "react";
import { useDepot } from "../lib/store";
import { Card, Button, PageHeader, Modal, Field, StatusBadge, EmptyState, useToast } from "../components/ui";
import { Icon } from "../components/Icons";
import { D, money, fmtDate } from "../lib/format";
import { patchRecord, deleteRecord, byDateDesc } from "../lib/repo";
import { postExpense, reverseTransaction } from "../lib/posting";
import { useAuth } from "../lib/auth";
import { exportCsv } from "../lib/print";

type Doc = Record<string, unknown>;
interface Form { category: string; amount: string; expense_date: string; description: string; method: string }
const CATEGORIES = ["تنخواہ", "کرایہ", "بجلی", "پانی", "مرمت", "ٹرانسپورٹ", "اسٹیشنری", "چائے پانی", "دیگر"];

export default function Expenses() {
  const d = useDepot();
  const { user } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [methodF, setMethodF] = useState("");
  const [catF, setCatF] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => byDateDesc(d.expenses, "expense_date").filter((e) =>
    (!methodF || String(e.method) === methodF) && (!catF || String(e.category) === catF)),
    [d.expenses, methodF, catF]);

  const total = rows.reduce((a, r) => a.plus(D(r.amount as string)), D(0));

  async function save(f: Form) {
    if (D(f.amount).lte(0)) { toast("رقم درست نہیں", "danger"); return; }
    setBusy(true);
    try {
      await postExpense({ category: f.category, amount: f.amount, expense_date: f.expense_date, description: f.description, method: f.method, actor: user?.uid ?? "web" });
      toast("خرچ درج ہو گیا"); setForm(null);
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
      <PageHeader eyebrow="ڈپو" title="اخراجات" description="روزانہ کے اخراجات اور اقسام">
        <Button variant="secondary" icon="download" onClick={() => exportCsv("expenses", [
          { header: "Date", value: (r) => String(r.expense_date) }, { header: "Category", value: (r) => String(r.category) },
          { header: "Amount", value: (r) => String(r.amount) }, { header: "Method", value: (r) => String(r.method) },
          { header: "Desc", value: (r) => String(r.description ?? "") },
        ], rows)}>CSV</Button>
        <Button variant="primary" icon="plus" onClick={() => setForm({ category: CATEGORIES[0], amount: "", expense_date: new Date().toISOString().slice(0, 10), description: "", method: "cash" })}>نیا خرچ</Button>
      </PageHeader>

      <div className="pnl-layout" style={{ marginBottom: 14 }}>
        <Card>
          <div className="card-head"><div><h2>اخراجات کی اقسام</h2><p>کل کے حساب سے</p></div></div>
          {totalsByCat.length === 0 ? <EmptyState icon="download" title="کوئی خرچ نہیں" /> : totalsByCat.map(([cat, v]) => (
            <div key={cat} style={{ margin: "12px 0" }}>
              <div className="tank-line" style={{ margin: "0 0 6px" }}>
                <div className="tank-name"><div><strong>{cat}</strong></div></div>
                <div className="tank-amount"><strong>{money(v)}</strong></div>
              </div>
              <div className="progress-track"><span className="progress-fill fill-warning" style={{ width: `${(v.toNumber() / maxCat) * 100}%` }} /></div>
            </div>
          ))}
        </Card>
        <Card>
          <div className="card-head"><div><h2>کل اخراجات</h2><p>موجودہ فلٹر</p></div></div>
          <div className="tank-stock"><span>رقم</span><strong>{money(total)}</strong><small>{rows.length} اندراج</small></div>
          <p className="insight"><Icon name="alert" size={14} /> اخراجات کیش بک میں خودکار طور پر اخراج کے طور پر درج ہوتے ہیں۔</p>
        </Card>
      </div>

      <Card className="filter-card">
        <select className="filter-select" value={catF} onChange={(e) => setCatF(e.target.value)}>
          <option value="">تمام اقسام</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="filter-select" value={methodF} onChange={(e) => setMethodF(e.target.value)}>
          <option value="">تمام طریقے</option><option value="cash">نقد</option><option value="bank">بینک</option><option value="other">دیگر</option>
        </select>
      </Card>

      <Card>
        <div className="card-head"><div><h2>اخراجات</h2><p>{rows.length} اندراج</p></div></div>
        {rows.length === 0 ? <EmptyState icon="download" title="کوئی خرچ نہیں" /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>تاریخ</th><th>حوالہ</th><th>قسم</th><th>طریقہ</th><th>رقم</th><th>تفصیل</th><th>حالت</th><th></th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={String(e.id)}>
                  <td>{fmtDate(String(e.expense_date))}</td>
                  <td className="latin">{String(e.ref_no)}</td>
                  <td>{String(e.category)}</td>
                  <td>{String(e.method) === "cash" ? "نقد" : String(e.method) === "bank" ? "بینک" : "دیگر"}</td>
                  <td className="num">{money(e.amount as string)}</td>
                  <td>{String(e.description ?? "—")}</td>
                  <td>{String(e.status) === "reversed" ? <StatusBadge status="failed" /> : <StatusBadge status="posted" />}</td>
                  <td>
                    <div className="table-tools">
                      <button onClick={async () => {
                        const reason = prompt("منسوخی کی وجہ؟") ?? ""; if (!reason) return;
                        try { await reverseTransaction({ entity: "expenses", id: String(e.id), reason, actor: user?.uid ?? "web" }); toast("منسوخ"); }
                        catch (er) { toast((er as Error).message, "danger"); }
                      }} title="منسوخ"><Icon name="alert" size={13} /></button>
                      <button onClick={async () => { if (!confirm("حذف کریں؟")) return; try { await deleteRecord("expenses", String(e.id)); toast("حذف"); } catch (er) { toast((er as Error).message, "danger"); } }} title="حذف">×</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      {form && (
        <Modal title="نیا خرچ" onClose={() => setForm(null)} footer={<>
          <Button onClick={() => setForm(null)}>منسوخ</Button>
          <Button variant="primary" disabled={busy} onClick={() => save(form)}>تصدیق و درج</Button>
        </>}>
          <div className="form-grid">
            <Field label="قسم">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            </Field>
            <Field label="رقم"><input className="latin" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label="تاریخ"><input className="latin" type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></Field>
            <Field label="طریقہ">
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option value="cash">نقد</option><option value="bank">بینک</option><option value="other">دیگر</option></select>
            </Field>
            <Field label="تفصیل" full><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}
