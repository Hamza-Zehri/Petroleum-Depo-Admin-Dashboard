import { useMemo, useState } from "react";
import { useDepot } from "../lib/store";
import { Card, Button, PageHeader, Modal, Field, StatusBadge, EmptyState, useToast } from "../components/ui";
import { Icon } from "../components/Icons";
import { D, money, fmtDate } from "../lib/format";
import { createRecord, patchRecord, deleteRecord, byDateDesc } from "../lib/repo";
import { postCustomerPayment } from "../lib/posting";
import { useAuth } from "../lib/auth";
import { exportCsv } from "../lib/print";
import { CsvImportModal } from "../components/CsvImportModal";
import { downloadTemplate } from "../lib/csv";
import { normalizePhone, D2 } from "../lib/csv";

type Doc = Record<string, unknown>;
interface Form { id?: string; name: string; company: string; contact: string; address: string; opening_balance: string; credit_limit: string; active: boolean }
const blank: Form = { name: "", company: "", contact: "", address: "", opening_balance: "0", credit_limit: "", active: true };

export default function Customers() {
  const d = useDepot();
  const { user } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [pay, setPay] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const balanceOf = (id: string) => d.customerBalances.find((b) => b.customerId === id)?.due ?? D(0);

  const rows = useMemo(() => d.customers
    .filter((c) => !q || String(c.name).toLowerCase().includes(q.toLowerCase()) || String(c.contact ?? "").includes(q))
    .sort((a, b) => balanceOf(String(b.id)).comparedTo(balanceOf(String(a.id)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.customers, d.customerBalances, q]);

  async function save(f: Form) {
    if (!f.name.trim()) { toast("نام درکار ہے", "danger"); return; }
    setBusy(true);
    try {
      const payload = { name: f.name.trim(), company: f.company, contact: f.contact, address: f.address, opening_balance: D(f.opening_balance).toFixed(2), credit_limit: f.credit_limit ? D(f.credit_limit).toFixed(2) : null, active: f.active, created_by: user?.uid ?? "web" };
      if (f.id) await patchRecord("customers", f.id, payload);
      else await createRecord("customers", payload, { createdBy: user?.uid });
      toast(f.id ? "گاہک اپ ڈیٹ" : "گاہک شامل"); setForm(null);
    } catch (e) { toast((e as Error).message, "danger"); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader eyebrow="ڈپو" title="گاہک" description="گاہک، ادھار اور وصولی">
        <Button variant="secondary" icon="download" onClick={() => exportCsv("customers", [
          { header: "Name", value: (c) => String(c.name) }, { header: "Contact", value: (c) => String(c.contact ?? "") },
          { header: "Opening", value: (c) => String(c.opening_balance) }, { header: "Due", value: (c) => balanceOf(String(c.id)).toFixed(2) },
        ], rows)}>CSV</Button>
        <Button variant="secondary" icon="download" onClick={() => downloadTemplate("customer-template.csv", ["customer_name", "phone", "business_name", "address", "opening_balance", "credit_limit", "notes"], ["Sample Customer", "03001234567", "Sample Traders", "Sample Address", "0", "50000", "Sample note"])}>Template</Button>
        <Button variant="secondary" icon="upload" onClick={() => setImportOpen(true)}>Import CSV</Button>
        <Button variant="primary" icon="plus" onClick={() => setForm({ ...blank })}>نیا گاہک</Button>
      </PageHeader>

      <Card className="filter-card">
        <div className="filter-search"><Icon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام یا رابطہ تلاش کریں" /></div>
      </Card>

      <Card>
        <div className="card-head"><div><h2>گاہک فہرست</h2><p>{rows.length} گاہک</p></div></div>
        {rows.length === 0 ? <EmptyState icon="users" title="کوئی گاہک نہیں" hint="نیا گاہک شامل کریں۔" /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>نام</th><th>رابطہ</th><th>ابتدائی</th><th>وصولی باقی</th><th>حد</th><th>حالت</th><th></th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const due = balanceOf(String(c.id));
                const limit = D((c.credit_limit as string) ?? "0");
                const over = limit.gt(0) && due.gt(limit);
                return (
                  <tr key={String(c.id)}>
                    <td><button className="record-link" onClick={() => setDetail(String(c.id))}>{String(c.name)}</button>{c.company ? <small style={{ color: "var(--slate-500)" }}> · {String(c.company)}</small> : null}</td>
                    <td className="latin">{String(c.contact ?? "—")}</td>
                    <td className="num">{money(c.opening_balance as string)}</td>
                    <td className={`num ${over ? "danger-text" : ""}`}>{money(due)}</td>
                    <td className="num">{limit.gt(0) ? money(limit) : "—"}</td>
                    <td><StatusBadge status={c.active === false ? "failed" : "active"} /></td>
                    <td>
                      <div className="table-tools">
                        <button onClick={() => setPay(String(c.id))} title="وصولی"><Icon name="wallet" size={13} /></button>
                        <button onClick={() => setForm({ id: String(c.id), name: String(c.name), company: String(c.company ?? ""), contact: String(c.contact ?? ""), address: String(c.address ?? ""), opening_balance: String(c.opening_balance), credit_limit: String(c.credit_limit ?? ""), active: c.active !== false })} title="ترمیم"><Icon name="file" size={13} /></button>
                        <button onClick={async () => {
                          if (!confirm("گاہک حذف کریں؟ (غیر فعال کرنا زیادہ محفوظ ہے)")) return;
                          try { await patchRecord("customers", String(c.id), { active: false }); toast("غیر فعال کر دیا گیا"); }
                          catch (e) { toast((e as Error).message, "danger"); }
                        }} title="غیر فعال">⊘</button>
                        <button onClick={async () => {
                          if (!confirm("مستقل حذف؟ یہ ناقابلِ واپسی ہے۔")) return;
                          try { await deleteRecord("customers", String(c.id)); toast("حذف ہو گیا"); }
                          catch (e) { toast((e as Error).message, "danger"); }
                        }} title="حذف">×</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </Card>

      {form && (
        <Modal title={form.id ? "گاہک میں ترمیم" : "نیا گاہک"} onClose={() => setForm(null)} footer={<>
          <Button onClick={() => setForm(null)}>منسوخ</Button>
          <Button variant="primary" disabled={busy} onClick={() => save(form)}>محفوظ کریں</Button>
        </>}>
          <div className="form-grid">
            <Field label="نام" full><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="کمپنی"><input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
            <Field label="رابطہ"><input className="latin" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
            <Field label="پتہ" full><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="ابتدائی بیلنس"><input className="latin" inputMode="decimal" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} /></Field>
            <Field label="کریڈٹ حد"><input className="latin" inputMode="decimal" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} /></Field>
            <Field label="فعال">
              <select value={String(form.active)} onChange={(e) => setForm({ ...form, active: e.target.value === "true" })}><option value="true">ہاں</option><option value="false">نہیں</option></select>
            </Field>
          </div>
        </Modal>
      )}

      {detail && <CustomerDetail id={detail} onClose={() => setDetail(null)} />}
      {pay && <PaymentModal customerId={pay} onClose={() => setPay(null)} />}

      {importOpen && (
        <CsvImportModal
          config={{
            title: "Import Customers from CSV",
            templateFilename: "customer-template.csv",
            templateHeaders: ["customer_name", "phone", "business_name", "address", "opening_balance", "credit_limit", "notes"],
            templateSample: ["Sample Customer", "03001234567", "Sample Traders", "Sample Address", "0", "50000", "Sample note"],
            expectedHeaders: ["customer_name", "phone", "business_name", "address", "opening_balance", "credit_limit", "notes"],
            headerLabels: { customer_name: "Name", phone: "Phone", business_name: "Business", address: "Address", opening_balance: "Opening", credit_limit: "Credit limit", notes: "Notes" },
            validateRow: (v) => {
              const errs: string[] = [];
              if (!v.customer_name.trim()) errs.push("Missing customer name");
              if (!D2(v.opening_balance)) errs.push("Invalid opening balance");
              if (v.credit_limit && !D2(v.credit_limit)) errs.push("Invalid credit limit");
              if (errs.length) return { ok: false, errors: errs };
              return {
                ok: true, errors: [], data: {
                  name: v.customer_name.trim(),
                  company: v.business_name,
                  contact: v.phone,
                  address: v.address,
                  opening_balance: (v.opening_balance === "" ? "0" : v.opening_balance),
                  credit_limit: v.credit_limit || null,
                  notes: v.notes,
                  active: true,
                },
              };
            },
            duplicateKey: (d: any) => {
              const ph = normalizePhone(String(d.contact ?? ""));
              return ph ? `phone:${ph}` : `name:${String(d.name).toLowerCase().trim()}`;
            },
            existing: d.customers as any,
            existingDuplicateKey: (r: any) => {
              const ph = normalizePhone(String(r.contact ?? ""));
              return ph ? `phone:${ph}` : `name:${String(r.name ?? "").toLowerCase().trim()}`;
            },
            onImport: async (rows: any[]) => {
              let created = 0;
              for (const r of rows) {
                await createRecord("customers", {
                  name: r.name, company: r.company, contact: r.contact, address: r.address,
                  opening_balance: D(r.opening_balance).toFixed(2),
                  credit_limit: r.credit_limit ? D(r.credit_limit).toFixed(2) : null,
                  notes: r.notes, active: true, created_by: user?.uid ?? "web",
                }, { createdBy: user?.uid });
                created++;
              }
              return { created, skipped: 0 };
            },
          }}
          onClose={() => setImportOpen(false)}
        />
      )}
    </>
  );
}


function CustomerDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const d = useDepot();
  const cust = d.customers.find((c) => String(c.id) === id);
  const b = d.customerBalances.find((x) => x.customerId === id);
  const sales = byDateDesc(d.sales.filter((s) => String(s.customer_id) === id), "created_at");
  const payments = byDateDesc(d.customerPayments.filter((p) => String(p.customer_id) === id), "created_at");
  return (
    <Modal title={`گاہک: ${String(cust?.name ?? "")}`} onClose={onClose} footer={<Button onClick={onClose}>بند کریں</Button>}>
      <div className="reconcile-grid">
        <div><span>ابتدائی</span><strong>{money(b?.opening ?? 0)}</strong></div>
        <div><span>کل فروخت (ادھار)</span><strong>{money(b?.invoiced ?? 0)}</strong></div>
        <div><span>وصول شدہ</span><strong>{money(b?.paid ?? 0)}</strong></div>
        <div><span>موجودہ باقی</span><strong>{money(b?.due ?? 0)}</strong></div>
      </div>
      <h3 style={{ margin: "18px 0 8px" }}>حالیہ فروخت</h3>
      <div className="table-scroll"><table><thead><tr><th>حوالہ</th><th>تاریخ</th><th>کل</th><th>باقی</th></tr></thead>
        <tbody>{sales.slice(0, 8).map((s) => (<tr key={String(s.id)}><td>{String(s.ref_no)}</td><td>{fmtDate(String(s.business_date))}</td><td className="num">{money(s.total_amount as string)}</td><td className="num">{money(s.due_amount as string)}</td></tr>))}
          {sales.length === 0 && <tr><td colSpan={4}>کوئی فروخت نہیں</td></tr>}</tbody></table></div>
      <h3 style={{ margin: "18px 0 8px" }}>حالیہ وصولیاں</h3>
      <div className="table-scroll"><table><thead><tr><th>حوالہ</th><th>تاریخ</th><th>رقم</th><th>طریقہ</th></tr></thead>
        <tbody>{payments.slice(0, 8).map((p) => (<tr key={String(p.id)}><td>{String(p.ref_no)}</td><td>{fmtDate(String(p.business_date))}</td><td className="num">{money(p.amount as string)}</td><td>{String(p.method)}</td></tr>))}
          {payments.length === 0 && <tr><td colSpan={4}>کوئی وصولی نہیں</td></tr>}</tbody></table></div>
    </Modal>
  );
}

function PaymentModal({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const d = useDepot();
  const { user } = useAuth();
  const toast = useToast();
  const cust = d.customers.find((c) => String(c.id) === customerId);
  const due = d.customerBalances.find((b) => b.customerId === customerId)?.due ?? D(0);
  const [amount, setAmount] = useState(due.gt(0) ? due.toFixed(2) : "");
  const [method, setMethod] = useState("cash");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`وصولی — ${String(cust?.name ?? "")}`} onClose={onClose} footer={<>
      <Button onClick={onClose}>منسوخ</Button>
      <Button variant="primary" disabled={busy} onClick={async () => {
        if (D(amount).lte(0)) { toast("رقم درست نہیں", "danger"); return; }
        setBusy(true);
        try { await postCustomerPayment({ customer_id: customerId, amount, method, reference_no: ref, notes, actor: user?.uid ?? "web" }); toast("وصولی درج"); onClose(); }
        catch (e) { toast((e as Error).message, "danger"); } finally { setBusy(false); }
      }}>تصدیق و درج</Button>
    </>}>
      <div className="review-block"><span>موجودہ باقی</span><strong>{money(due)}</strong></div>
      <div className="form-grid">
        <Field label="رقم"><input className="latin" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="طریقہ">
          <select value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">نقد</option><option value="bank">بینک</option><option value="other">دیگر</option></select>
        </Field>
        <Field label="حوالہ نمبر"><input className="latin" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        <Field label="نوٹ" full><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
