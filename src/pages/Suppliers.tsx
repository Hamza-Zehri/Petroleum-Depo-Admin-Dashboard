import { useMemo, useState } from "react";
import { useDepot } from "../lib/store";
import { Card, Button, PageHeader, Modal, Field, StatusBadge, EmptyState, useToast } from "../components/ui";
import { Icon } from "../components/Icons";
import { D, money, fmtDate } from "../lib/format";
import { createRecord, patchRecord, deleteRecord, byDateDesc } from "../lib/repo";
import { postSupplierPayment } from "../lib/posting";
import { useAuth } from "../lib/auth";
import { exportCsv } from "../lib/print";
import { CsvImportModal } from "../components/CsvImportModal";
import { downloadTemplate } from "../lib/csv";
import { normalizePhone, D2 } from "../lib/csv";

type Doc = Record<string, unknown>;
interface Form { id?: string; name: string; company: string; contact: string; address: string; opening_balance: string; active: boolean }
const blank: Form = { name: "", company: "", contact: "", address: "", opening_balance: "0", active: true };

export default function Suppliers() {
  const d = useDepot();
  const { user } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [pay, setPay] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const dueOf = (id: string) => d.supplierBalances.find((b) => b.supplierId === id)?.due ?? D(0);

  const rows = useMemo(() => d.suppliers
    .filter((s) => !q || String(s.name).toLowerCase().includes(q.toLowerCase()) || String(s.contact ?? "").includes(q))
    .sort((a, b) => dueOf(String(b.id)).comparedTo(dueOf(String(a.id)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.suppliers, d.supplierBalances, q]);

  async function save(f: Form) {
    if (!f.name.trim()) { toast("نام درکار ہے", "danger"); return; }
    setBusy(true);
    try {
      const payload = { name: f.name.trim(), company: f.company, contact: f.contact, address: f.address, opening_balance: D(f.opening_balance).toFixed(2), active: f.active, created_by: user?.uid ?? "web" };
      if (f.id) await patchRecord("suppliers", f.id, payload);
      else await createRecord("suppliers", payload, { createdBy: user?.uid });
      toast(f.id ? "سپلائر اپ ڈیٹ" : "سپلائر شامل"); setForm(null);
    } catch (e) { toast((e as Error).message, "danger"); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader eyebrow="ڈپو" title="سپلائر" description="سپلائر، خریداری و ادائیگی">
        <Button variant="secondary" icon="download" onClick={() => exportCsv("suppliers", [
          { header: "Name", value: (s) => String(s.name) }, { header: "Contact", value: (s) => String(s.contact ?? "") },
          { header: "Opening", value: (s) => String(s.opening_balance) }, { header: "Payable", value: (s) => dueOf(String(s.id)).toFixed(2) },
        ], rows)}>CSV</Button>
        <Button variant="secondary" icon="download" onClick={() => downloadTemplate("supplier-template.csv", ["supplier_name", "phone", "business_name", "address", "opening_balance", "notes"], ["Sample Supplier", "03001234567", "Sample Petroleum", "Sample Address", "0", "Sample note"])}>Template</Button>
        <Button variant="secondary" icon="upload" onClick={() => setImportOpen(true)}>Import CSV</Button>
        <Button variant="primary" icon="plus" onClick={() => setForm({ ...blank })}>نیا سپلائر</Button>
      </PageHeader>

      <Card className="filter-card">
        <div className="filter-search"><Icon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام یا رابطہ تلاش کریں" /></div>
      </Card>

      <Card>
        <div className="card-head"><div><h2>سپلائر فہرست</h2><p>{rows.length} سپلائر</p></div></div>
        {rows.length === 0 ? <EmptyState icon="box" title="کوئی سپلائر نہیں" hint="نیا سپلائر شامل کریں۔" /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>نام</th><th>رابطہ</th><th>ابتدائی</th><th>دینا (باقی)</th><th>حالت</th><th></th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={String(s.id)}>
                  <td><button className="record-link" onClick={() => setDetail(String(s.id))}>{String(s.name)}</button>{s.company ? <small style={{ color: "var(--slate-500)" }}> · {String(s.company)}</small> : null}</td>
                  <td className="latin">{String(s.contact ?? "—")}</td>
                  <td className="num">{money(s.opening_balance as string)}</td>
                  <td className="num">{money(dueOf(String(s.id)))}</td>
                  <td><StatusBadge status={s.active === false ? "failed" : "active"} /></td>
                  <td>
                    <div className="table-tools">
                      <button onClick={() => setPay(String(s.id))} title="ادائیگی"><Icon name="wallet" size={13} /></button>
                      <button onClick={() => setForm({ id: String(s.id), name: String(s.name), company: String(s.company ?? ""), contact: String(s.contact ?? ""), address: String(s.address ?? ""), opening_balance: String(s.opening_balance), active: s.active !== false })} title="ترمیم"><Icon name="file" size={13} /></button>
                      <button onClick={async () => {
                        if (!confirm("سپلائر غیر فعال کریں؟")) return;
                        try { await patchRecord("suppliers", String(s.id), { active: false }); toast("غیر فعال"); }
                        catch (e) { toast((e as Error).message, "danger"); }
                      }} title="غیر فعال">⊘</button>
                      <button onClick={async () => {
                        if (!confirm("مستقل حذف؟")) return;
                        try { await deleteRecord("suppliers", String(s.id)); toast("حذف ہو گیا"); }
                        catch (e) { toast((e as Error).message, "danger"); }
                      }} title="حذف">×</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      {form && (
        <Modal title={form.id ? "سپلائر میں ترمیم" : "نیا سپلائر"} onClose={() => setForm(null)} footer={<>
          <Button onClick={() => setForm(null)}>منسوخ</Button>
          <Button variant="primary" disabled={busy} onClick={() => save(form)}>محفوظ کریں</Button>
        </>}>
          <div className="form-grid">
            <Field label="نام" full><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="کمپنی"><input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
            <Field label="رابطہ"><input className="latin" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
            <Field label="پتہ" full><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="ابتدائی بیلنس"><input className="latin" inputMode="decimal" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} /></Field>
            <Field label="فعال">
              <select value={String(form.active)} onChange={(e) => setForm({ ...form, active: e.target.value === "true" })}><option value="true">ہاں</option><option value="false">نہیں</option></select>
            </Field>
          </div>
        </Modal>
      )}

      {detail && <SupplierDetail id={detail} onClose={() => setDetail(null)} />}
      {pay && <PayModal supplierId={pay} onClose={() => setPay(null)} />}

      {importOpen && (
        <CsvImportModal
          config={{
            title: "Import Suppliers from CSV",
            templateFilename: "supplier-template.csv",
            templateHeaders: ["supplier_name", "phone", "business_name", "address", "opening_balance", "notes"],
            templateSample: ["Sample Supplier", "03001234567", "Sample Petroleum", "Sample Address", "0", "Sample note"],
            expectedHeaders: ["supplier_name", "phone", "business_name", "address", "opening_balance", "notes"],
            headerLabels: { supplier_name: "Name", phone: "Phone", business_name: "Business", address: "Address", opening_balance: "Opening payable", notes: "Notes" },
            validateRow: (v) => {
              const errs: string[] = [];
              if (!v.supplier_name.trim()) errs.push("Missing supplier name");
              if (!D2(v.opening_balance)) errs.push("Invalid opening balance");
              if (errs.length) return { ok: false, errors: errs };
              return {
                ok: true, errors: [], data: {
                  name: v.supplier_name.trim(),
                  company: v.business_name,
                  contact: v.phone,
                  address: v.address,
                  opening_balance: (v.opening_balance === "" ? "0" : v.opening_balance),
                  notes: v.notes,
                  active: true,
                },
              };
            },
            duplicateKey: (d: any) => {
              const ph = normalizePhone(String(d.contact ?? ""));
              return ph ? `phone:${ph}` : `name:${String(d.name).toLowerCase().trim()}`;
            },
            existing: d.suppliers as any,
            existingDuplicateKey: (r: any) => {
              const ph = normalizePhone(String(r.contact ?? ""));
              return ph ? `phone:${ph}` : `name:${String(r.name ?? "").toLowerCase().trim()}`;
            },
            onImport: async (rows: any[]) => {
              let created = 0;
              for (const r of rows) {
                await createRecord("suppliers", {
                  name: r.name, company: r.company, contact: r.contact, address: r.address,
                  opening_balance: D(r.opening_balance).toFixed(2),
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

function SupplierDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const d = useDepot();
  const s = d.suppliers.find((x) => String(x.id) === id);
  const b = d.supplierBalances.find((x) => x.supplierId === id);
  const purchases = byDateDesc(d.purchases.filter((p) => String(p.supplier_id) === id), "created_at");
  const payments = byDateDesc(d.supplierPayments.filter((p) => String(p.supplier_id) === id), "created_at");
  return (
    <Modal title={`سپلائر: ${String(s?.name ?? "")}`} onClose={onClose} footer={<Button onClick={onClose}>بند کریں</Button>}>
      <div className="reconcile-grid">
        <div><span>ابتدائی</span><strong>{money(b?.opening ?? 0)}</strong></div>
        <div><span>کل خریداری</span><strong>{money(b?.purchases ?? 0)}</strong></div>
        <div><span>ادا شدہ</span><strong>{money(b?.paid ?? 0)}</strong></div>
        <div><span>موجودہ باقی</span><strong>{money(b?.due ?? 0)}</strong></div>
      </div>
      <h3 style={{ margin: "18px 0 8px" }}>حالیہ خریداری</h3>
      <div className="table-scroll"><table><thead><tr><th>حوالہ</th><th>تاریخ</th><th>کل</th><th>حالت</th></tr></thead>
        <tbody>{purchases.slice(0, 8).map((p) => (<tr key={String(p.id)}><td>{String(p.ref_no)}</td><td>{fmtDate(String(p.business_date))}</td><td className="num">{money(p.total_amount as string)}</td><td>{String(p.payment_status)}</td></tr>))}
          {purchases.length === 0 && <tr><td colSpan={4}>کوئی خریداری نہیں</td></tr>}</tbody></table></div>
      <h3 style={{ margin: "18px 0 8px" }}>حالیہ ادائیگیاں</h3>
      <div className="table-scroll"><table><thead><tr><th>حوالہ</th><th>تاریخ</th><th>رقم</th><th>طریقہ</th></tr></thead>
        <tbody>{payments.slice(0, 8).map((p) => (<tr key={String(p.id)}><td>{String(p.ref_no)}</td><td>{fmtDate(String(p.business_date))}</td><td className="num">{money(p.amount as string)}</td><td>{String(p.method)}</td></tr>))}
          {payments.length === 0 && <tr><td colSpan={4}>کوئی ادائیگی نہیں</td></tr>}</tbody></table></div>
    </Modal>
  );
}

function PayModal({ supplierId, onClose }: { supplierId: string; onClose: () => void }) {
  const d = useDepot();
  const { user } = useAuth();
  const toast = useToast();
  const s = d.suppliers.find((x) => String(x.id) === supplierId);
  const due = d.supplierBalances.find((b) => b.supplierId === supplierId)?.due ?? D(0);
  const [amount, setAmount] = useState(due.gt(0) ? due.toFixed(2) : "");
  const [method, setMethod] = useState("cash");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`ادائیگی — ${String(s?.name ?? "")}`} onClose={onClose} footer={<>
      <Button onClick={onClose}>منسوخ</Button>
      <Button variant="primary" disabled={busy} onClick={async () => {
        if (D(amount).lte(0)) { toast("رقم درست نہیں", "danger"); return; }
        setBusy(true);
        try { await postSupplierPayment({ supplier_id: supplierId, amount, method, reference_no: ref, notes, actor: user?.uid ?? "web" }); toast("ادائیگی درج"); onClose(); }
        catch (e) { toast((e as Error).message, "danger"); } finally { setBusy(false); }
      }}>تصدیق و درج</Button>
    </>}>
      <div className="review-block"><span>موجودہ دینا</span><strong>{money(due)}</strong></div>
      <div className="form-grid">
        <Field label="رقم"><input className="latin" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="طریقہ"><select value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">نقد</option><option value="bank">بینک</option><option value="other">دیگر</option></select></Field>
        <Field label="حوالہ"><input className="latin" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        <Field label="نوٹ" full><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
