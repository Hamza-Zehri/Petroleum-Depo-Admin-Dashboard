import { useMemo, useState } from "react";
import { useDepot } from "../lib/store";
import { Card, Button, PageHeader, Modal, Field, StatusBadge, EmptyState, useToast } from "../components/ui";
import { Icon } from "../components/Icons";
import { D, money, fmtDate } from "../lib/format";
import { createRecord, createRecordsBatch, patchRecord, deleteRecord, byDateDesc } from "../lib/repo";
import { postCustomerPayment } from "../lib/posting";
import { useAuth } from "../lib/auth";
import { useLang } from "../lib/lang";
import { methodLabel } from "../lib/labels";
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
  const { t } = useLang();
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
    if (!f.name.trim()) { toast(t.requiredName, "danger"); return; }
    setBusy(true);
    try {
      const payload = { name: f.name.trim(), company: f.company, contact: f.contact, address: f.address, opening_balance: D(f.opening_balance).toFixed(2), credit_limit: f.credit_limit ? D(f.credit_limit).toFixed(2) : null, active: f.active, created_by: user?.uid ?? "web" };
      if (f.id) await patchRecord("customers", f.id, payload);
      else await createRecord("customers", payload, { createdBy: user?.uid });
      toast(f.id ? t.customerUpdated : t.customerAdded); setForm(null);
    } catch (e) { toast((e as Error).message, "danger"); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader eyebrow={t.all} title={t.customersTitle} description={t.customersDesc}>
        <Button variant="secondary" icon="download" onClick={() => exportCsv("customers", [
          { header: t.name, value: (c) => String(c.name) }, { header: t.contact, value: (c) => String(c.contact ?? "") },
          { header: t.openingBalance, value: (c) => String(c.opening_balance) }, { header: t.due, value: (c) => balanceOf(String(c.id)).toFixed(2) },
        ], rows)}>CSV</Button>
        <Button variant="secondary" icon="download" onClick={() => downloadTemplate("customer-template.csv", ["customer_name", "phone", "business_name", "address", "opening_balance", "credit_limit", "notes"], ["Sample Customer", "03001234567", "Sample Traders", "Sample Address", "0", "50000", "Sample note"])}>{t.template}</Button>
        <Button variant="secondary" icon="upload" onClick={() => setImportOpen(true)}>{t.importSheet}</Button>
        <Button variant="primary" icon="plus" onClick={() => setForm({ ...blank })}>{t.addCustomer}</Button>
      </PageHeader>

      <Card className="filter-card">
        <div className="filter-search"><Icon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchNameContact} /></div>
      </Card>

      <Card>
        <div className="card-head"><div><h2>{t.customerList}</h2><p>{rows.length} {t.customersCount}</p></div></div>
        {rows.length === 0 ? <EmptyState icon="users" title={t.noCustomers} hint={t.noCustomersHint} /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>{t.name}</th><th>{t.contact}</th><th>{t.openingBalance}</th><th>{t.due}</th><th>{t.limitCol}</th><th>{t.statusHeader}</th><th></th></tr></thead>
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
                    <td><StatusBadge status={c.active === false ? "inactive" : "active"} /></td>
                    <td>
                      <div className="table-tools">
                        <button onClick={() => setPay(String(c.id))} title={t.payAction}><Icon name="wallet" size={13} /></button>
                        <button onClick={() => setForm({ id: String(c.id), name: String(c.name), company: String(c.company ?? ""), contact: String(c.contact ?? ""), address: String(c.address ?? ""), opening_balance: String(c.opening_balance), credit_limit: String(c.credit_limit ?? ""), active: c.active !== false })} title={t.edit}><Icon name="file" size={13} /></button>
                        <button onClick={async () => {
                          if (!confirm(t.confirmDeactivateCustomer)) return;
                          try { await patchRecord("customers", String(c.id), { active: false }); toast(t.customerDeactivated); }
                          catch (e) { toast((e as Error).message, "danger"); }
                        }} title={t.deactivate}>⊘</button>
                        <button onClick={async () => {
                          if (!confirm(t.confirmDeleteCustomer)) return;
                          try { await deleteRecord("customers", String(c.id)); toast(t.customerDeleted); }
                          catch (e) { toast((e as Error).message, "danger"); }
                        }} title={t.delete}>×</button>
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
        <Modal title={form.id ? t.editCustomer : t.newCustomer} onClose={() => setForm(null)} footer={<>
          <Button onClick={() => setForm(null)}>{t.cancel}</Button>
          <Button variant="primary" disabled={busy} onClick={() => save(form)}>{t.save}</Button>
        </>}>
          <div className="form-grid">
            <Field label={t.name} full><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label={t.company}><input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
            <Field label={t.contact}><input className="latin" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
            <Field label={t.address} full><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label={t.openingBalance}><input className="latin" inputMode="decimal" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} /></Field>
            <Field label={t.creditLimit}><input className="latin" inputMode="decimal" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} /></Field>
            <Field label={t.active}>
              <select value={String(form.active)} onChange={(e) => setForm({ ...form, active: e.target.value === "true" })}><option value="true">{t.yes}</option><option value="false">{t.no}</option></select>
            </Field>
          </div>
        </Modal>
      )}

      {detail && <CustomerDetail id={detail} onClose={() => setDetail(null)} />}
      {pay && <PaymentModal customerId={pay} onClose={() => setPay(null)} />}

      {importOpen && (
        <CsvImportModal
          config={{
            title: `${t.importTitle} — ${t.customersTitle}`,
            templateFilename: "customer-template.csv",
            templateHeaders: ["customer_name", "phone", "business_name", "address", "opening_balance", "credit_limit", "notes"],
            templateSample: ["Sample Customer", "03001234567", "Sample Traders", "Sample Address", "0", "50000", "Sample note"],
            expectedHeaders: ["customer_name", "phone", "business_name", "address", "opening_balance", "credit_limit", "notes"],
            requiredHeaders: ["customer_name", "opening_balance"],
            headerAliases: {
              name: "customer_name", customer: "customer_name", "customer name": "customer_name",
              mobile: "phone", contact: "phone", phone_no: "phone", phone_number: "phone",
              business: "business_name", company: "business_name",
              opening: "opening_balance", balance: "opening_balance",
              limit: "credit_limit", note: "notes",
            },
            headerLabels: {
              customer_name: t.name, phone: t.phone, business_name: t.business,
              address: t.address, opening_balance: t.openingBalance,
              credit_limit: t.creditLimit, notes: t.note,
            },
            validateRow: (v) => {
              const errs: string[] = [];
              if (!v.customer_name.trim()) errs.push(t.missingCustomerName);
              if (!D2(v.opening_balance)) errs.push(t.invalidOpeningBalance);
              if (v.credit_limit && !D2(v.credit_limit)) errs.push(t.invalidCreditLimit);
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
              const created = await createRecordsBatch(
                "customers",
                rows.map((r) => ({
                  name: r.name, company: r.company, contact: r.contact, address: r.address,
                  opening_balance: D(r.opening_balance).toFixed(2),
                  credit_limit: r.credit_limit ? D(r.credit_limit).toFixed(2) : null,
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


function CustomerDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const d = useDepot();
  const { t } = useLang();
  const cust = d.customers.find((c) => String(c.id) === id);
  const b = d.customerBalances.find((x) => x.customerId === id);
  const sales = byDateDesc(d.sales.filter((s) => String(s.customer_id) === id), "created_at");
  const payments = byDateDesc(d.customerPayments.filter((p) => String(p.customer_id) === id), "created_at");
  return (
    <Modal title={`${t.customerWord}: ${String(cust?.name ?? "")}`} onClose={onClose} footer={<Button onClick={onClose}>{t.close}</Button>}>
      <div className="reconcile-grid">
        <div><span>{t.openingBalance}</span><strong>{money(b?.opening ?? 0)}</strong></div>
        <div><span>{t.totalCreditSales}</span><strong>{money(b?.invoiced ?? 0)}</strong></div>
        <div><span>{t.collected}</span><strong>{money(b?.paid ?? 0)}</strong></div>
        <div><span>{t.currentDue}</span><strong>{money(b?.due ?? 0)}</strong></div>
      </div>
      <h3 style={{ margin: "18px 0 8px" }}>{t.recentSales}</h3>
      <div className="table-scroll"><table><thead><tr><th>{t.ref}</th><th>{t.date}</th><th>{t.total}</th><th>{t.due}</th></tr></thead>
        <tbody>{sales.slice(0, 8).map((s) => (<tr key={String(s.id)}><td>{String(s.ref_no)}</td><td>{fmtDate(String(s.business_date))}</td><td className="num">{money(s.total_amount as string)}</td><td className="num">{money(s.due_amount as string)}</td></tr>))}
          {sales.length === 0 && <tr><td colSpan={4}>{t.noSales}</td></tr>}</tbody></table></div>
      <h3 style={{ margin: "18px 0 8px" }}>{t.recentPayments}</h3>
      <div className="table-scroll"><table><thead><tr><th>{t.ref}</th><th>{t.date}</th><th>{t.amount}</th><th>{t.method}</th></tr></thead>
        <tbody>{payments.slice(0, 8).map((p) => (<tr key={String(p.id)}><td>{String(p.ref_no)}</td><td>{fmtDate(String(p.business_date))}</td><td className="num">{money(p.amount as string)}</td><td>{methodLabel(String(p.method), t)}</td></tr>))}
          {payments.length === 0 && <tr><td colSpan={4}>{t.noPayments}</td></tr>}</tbody></table></div>
    </Modal>
  );
}

function PaymentModal({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const d = useDepot();
  const { user } = useAuth();
  const { t } = useLang();
  const toast = useToast();
  const cust = d.customers.find((c) => String(c.id) === customerId);
  const due = d.customerBalances.find((b) => b.customerId === customerId)?.due ?? D(0);
  const [amount, setAmount] = useState(due.gt(0) ? due.toFixed(2) : "");
  const [method, setMethod] = useState("cash");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`${t.customerPayment} — ${String(cust?.name ?? "")}`} onClose={onClose} footer={<>
      <Button onClick={onClose}>{t.cancel}</Button>
      <Button variant="primary" disabled={busy} onClick={async () => {
        if (D(amount).lte(0)) { toast(t.invalidAmount, "danger"); return; }
        setBusy(true);
        try { await postCustomerPayment({ customer_id: customerId, amount, method, reference_no: ref, notes, actor: user?.uid ?? "web" }); toast(t.paymentReceived); onClose(); }
        catch (e) { toast((e as Error).message, "danger"); } finally { setBusy(false); }
      }}>{t.confirmAndPost}</Button>
    </>}>
      <div className="review-block"><span>{t.currentDue}</span><strong>{money(due)}</strong></div>
      <div className="form-grid">
        <Field label={t.amount}><input className="latin" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label={t.method}>
          <select value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">{t.methods.cash}</option><option value="bank">{t.methods.bank}</option><option value="other">{t.methods.other}</option></select>
        </Field>
        <Field label={t.referenceNo}><input className="latin" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        <Field label={t.note} full><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
