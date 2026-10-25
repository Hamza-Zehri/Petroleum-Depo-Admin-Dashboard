import { useMemo, useState } from "react";
import { useDepot } from "../lib/store";
import { Card, Button, PageHeader, Modal, Field, StatusBadge, EmptyState, useToast } from "../components/ui";
import { Icon } from "../components/Icons";
import { D, money, fmtDate } from "../lib/format";
import { createRecord, createRecordsBatch, patchRecord, deleteRecord, byDateDesc } from "../lib/repo";
import { postSupplierPayment } from "../lib/posting";
import { useAuth } from "../lib/auth";
import { useLang } from "../lib/lang";
import { methodLabel } from "../lib/labels";
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
  const { t } = useLang();
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
    if (!f.name.trim()) { toast(t.requiredName, "danger"); return; }
    setBusy(true);
    try {
      const payload = { name: f.name.trim(), company: f.company, contact: f.contact, address: f.address, opening_balance: D(f.opening_balance).toFixed(2), active: f.active, created_by: user?.uid ?? "web" };
      if (f.id) await patchRecord("suppliers", f.id, payload);
      else await createRecord("suppliers", payload, { createdBy: user?.uid });
      toast(f.id ? t.supplierUpdated : t.supplierAdded); setForm(null);
    } catch (e) { toast((e as Error).message, "danger"); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader eyebrow={t.all} title={t.suppliersTitle} description={t.suppliersDesc}>
        <Button variant="secondary" icon="download" onClick={() => exportCsv("suppliers", [
          { header: t.name, value: (s) => String(s.name) }, { header: t.contact, value: (s) => String(s.contact ?? "") },
          { header: t.openingBalance, value: (s) => String(s.opening_balance) }, { header: t.balancePayable, value: (s) => dueOf(String(s.id)).toFixed(2) },
        ], rows)}>CSV</Button>
        <Button variant="secondary" icon="download" onClick={() => downloadTemplate("supplier-template.csv", ["supplier_name", "phone", "business_name", "address", "opening_balance", "notes"], ["Sample Supplier", "03001234567", "Sample Petroleum", "Sample Address", "0", "Sample note"])}>{t.template}</Button>
        <Button variant="secondary" icon="upload" onClick={() => setImportOpen(true)}>{t.importSheet}</Button>
        <Button variant="primary" icon="plus" onClick={() => setForm({ ...blank })}>{t.addSupplier}</Button>
      </PageHeader>

      <Card className="filter-card">
        <div className="filter-search"><Icon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchNameContact} /></div>
      </Card>

      <Card>
        <div className="card-head"><div><h2>{t.supplierList}</h2><p>{rows.length} {t.suppliersCount}</p></div></div>
        {rows.length === 0 ? <EmptyState icon="box" title={t.noSuppliers} hint={t.noSuppliersHint} /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>{t.name}</th><th>{t.contact}</th><th>{t.openingBalance}</th><th>{t.currentPayable}</th><th>{t.statusHeader}</th><th></th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={String(s.id)}>
                  <td><button className="record-link" onClick={() => setDetail(String(s.id))}>{String(s.name)}</button>{s.company ? <small style={{ color: "var(--slate-500)" }}> · {String(s.company)}</small> : null}</td>
                  <td className="latin">{String(s.contact ?? "—")}</td>
                  <td className="num">{money(s.opening_balance as string)}</td>
                  <td className="num">{money(dueOf(String(s.id)))}</td>
                  <td><StatusBadge status={s.active === false ? "inactive" : "active"} /></td>
                  <td>
                    <div className="table-tools">
                      <button onClick={() => setPay(String(s.id))} title={t.payAction}><Icon name="wallet" size={13} /></button>
                      <button onClick={() => setForm({ id: String(s.id), name: String(s.name), company: String(s.company ?? ""), contact: String(s.contact ?? ""), address: String(s.address ?? ""), opening_balance: String(s.opening_balance), active: s.active !== false })} title={t.edit}><Icon name="file" size={13} /></button>
                      <button onClick={async () => {
                        if (!confirm(t.confirmDeactivateSupplier)) return;
                        try { await patchRecord("suppliers", String(s.id), { active: false }); toast(t.supplierDeactivated); }
                        catch (e) { toast((e as Error).message, "danger"); }
                      }} title={t.deactivate}>⊘</button>
                      <button onClick={async () => {
                        if (!confirm(t.confirmDeleteSupplier)) return;
                        try { await deleteRecord("suppliers", String(s.id)); toast(t.supplierDeleted); }
                        catch (e) { toast((e as Error).message, "danger"); }
                      }} title={t.delete}>×</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      {form && (
        <Modal title={form.id ? t.editSupplier : t.newSupplier} onClose={() => setForm(null)} footer={<>
          <Button onClick={() => setForm(null)}>{t.cancel}</Button>
          <Button variant="primary" disabled={busy} onClick={() => save(form)}>{t.save}</Button>
        </>}>
          <div className="form-grid">
            <Field label={t.name} full><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label={t.company}><input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
            <Field label={t.contact}><input className="latin" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
            <Field label={t.address} full><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label={t.openingBalance}><input className="latin" inputMode="decimal" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} /></Field>
            <Field label={t.active}>
              <select value={String(form.active)} onChange={(e) => setForm({ ...form, active: e.target.value === "true" })}><option value="true">{t.yes}</option><option value="false">{t.no}</option></select>
            </Field>
          </div>
        </Modal>
      )}

      {detail && <SupplierDetail id={detail} onClose={() => setDetail(null)} />}
      {pay && <PayModal supplierId={pay} onClose={() => setPay(null)} />}

      {importOpen && (
        <CsvImportModal
          config={{
            title: `${t.importTitle} — ${t.suppliersTitle}`,
            templateFilename: "supplier-template.csv",
            templateHeaders: ["supplier_name", "phone", "business_name", "address", "opening_balance", "notes"],
            templateSample: ["Sample Supplier", "03001234567", "Sample Petroleum", "Sample Address", "0", "Sample note"],
            expectedHeaders: ["supplier_name", "phone", "business_name", "address", "opening_balance", "notes"],
            requiredHeaders: ["supplier_name", "opening_balance"],
            headerAliases: {
              name: "supplier_name", supplier: "supplier_name", "supplier name": "supplier_name",
              mobile: "phone", contact: "phone", phone_no: "phone", phone_number: "phone",
              business: "business_name", company: "business_name",
              opening: "opening_balance", balance: "opening_balance", payable: "opening_balance",
              note: "notes",
            },
            headerLabels: {
              supplier_name: t.name, phone: t.phone, business_name: t.business,
              address: t.address, opening_balance: t.openingBalance, notes: t.note,
            },
            validateRow: (v) => {
              const errs: string[] = [];
              if (!v.supplier_name.trim()) errs.push(t.missingSupplierName);
              if (!D2(v.opening_balance)) errs.push(t.invalidOpeningBalance);
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
              const created = await createRecordsBatch(
                "suppliers",
                rows.map((r) => ({
                  name: r.name, company: r.company, contact: r.contact, address: r.address,
                  opening_balance: D(r.opening_balance).toFixed(2),
                  notes: r.notes, active: true, created_by: user?.uid ?? "ADMIN",
                })),
                { createdBy: user?.uid },
              );
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
  const { t } = useLang();
  const s = d.suppliers.find((x) => String(x.id) === id);
  const b = d.supplierBalances.find((x) => x.supplierId === id);
  const purchases = byDateDesc(d.purchases.filter((p) => String(p.supplier_id) === id), "created_at");
  const payments = byDateDesc(d.supplierPayments.filter((p) => String(p.supplier_id) === id), "created_at");
  return (
    <Modal title={`${t.supplierWord}: ${String(s?.name ?? "")}`} onClose={onClose} footer={<Button onClick={onClose}>{t.close}</Button>}>
      <div className="reconcile-grid">
        <div><span>{t.openingBalance}</span><strong>{money(b?.opening ?? 0)}</strong></div>
        <div><span>{t.totalPurchases}</span><strong>{money(b?.purchases ?? 0)}</strong></div>
        <div><span>{t.paidLabel}</span><strong>{money(b?.paid ?? 0)}</strong></div>
        <div><span>{t.currentPayable}</span><strong>{money(b?.due ?? 0)}</strong></div>
      </div>
      <h3 style={{ margin: "18px 0 8px" }}>{t.recentPurchases}</h3>
      <div className="table-scroll"><table><thead><tr><th>{t.ref}</th><th>{t.date}</th><th>{t.total}</th><th>{t.statusHeader}</th></tr></thead>
        <tbody>{purchases.slice(0, 8).map((p) => (<tr key={String(p.id)}><td>{String(p.ref_no)}</td><td>{fmtDate(String(p.business_date))}</td><td className="num">{money(p.total_amount as string)}</td><td><StatusBadge status={String(p.payment_status)} /></td></tr>))}
          {purchases.length === 0 && <tr><td colSpan={4}>{t.noPurchases}</td></tr>}</tbody></table></div>
      <h3 style={{ margin: "18px 0 8px" }}>{t.recentSupplierPayments}</h3>
      <div className="table-scroll"><table><thead><tr><th>{t.ref}</th><th>{t.date}</th><th>{t.amount}</th><th>{t.method}</th></tr></thead>
        <tbody>{payments.slice(0, 8).map((p) => (<tr key={String(p.id)}><td>{String(p.ref_no)}</td><td>{fmtDate(String(p.business_date))}</td><td className="num">{money(p.amount as string)}</td><td>{methodLabel(String(p.method), t)}</td></tr>))}
          {payments.length === 0 && <tr><td colSpan={4}>{t.noSupplierPayments}</td></tr>}</tbody></table></div>
    </Modal>
  );
}

function PayModal({ supplierId, onClose }: { supplierId: string; onClose: () => void }) {
  const d = useDepot();
  const { user } = useAuth();
  const { t } = useLang();
  const toast = useToast();
  const s = d.suppliers.find((x) => String(x.id) === supplierId);
  const due = d.supplierBalances.find((b) => b.supplierId === supplierId)?.due ?? D(0);
  const [amount, setAmount] = useState(due.gt(0) ? due.toFixed(2) : "");
  const [method, setMethod] = useState("cash");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`${t.supplierPayment} — ${String(s?.name ?? "")}`} onClose={onClose} footer={<>
      <Button onClick={onClose}>{t.cancel}</Button>
      <Button variant="primary" disabled={busy} onClick={async () => {
        if (D(amount).lte(0)) { toast(t.invalidAmount, "danger"); return; }
        setBusy(true);
        try { await postSupplierPayment({ supplier_id: supplierId, amount, method, reference_no: ref, notes, actor: user?.uid ?? "web" }); toast(t.paymentPosted); onClose(); }
        catch (e) { toast((e as Error).message, "danger"); } finally { setBusy(false); }
      }}>{t.confirmAndPost}</Button>
    </>}>
      <div className="review-block"><span>{t.currentPayable}</span><strong>{money(due)}</strong></div>
      <div className="form-grid">
        <Field label={t.amount}><input className="latin" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label={t.method}><select value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">{t.methods.cash}</option><option value="bank">{t.methods.bank}</option><option value="other">{t.methods.other}</option></select></Field>
        <Field label={t.ref}><input className="latin" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        <Field label={t.note} full><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
