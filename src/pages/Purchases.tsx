import { useMemo, useState } from "react";
import { useDepot } from "../lib/store";
import { Card, Button, PageHeader, Modal, Field, StatusBadge, EmptyState, useToast } from "../components/ui";
import { Icon } from "../components/Icons";
import { D, money, qty, fmtDate } from "../lib/format";
import { patchRecord, deleteRecord, byDateDesc } from "../lib/repo";
import { postPurchase, reverseTransaction } from "../lib/posting";
import { useAuth } from "../lib/auth";
import { useLang } from "../lib/lang";
import { fuelLabel } from "../lib/labels";
import { exportCsv } from "../lib/print";

type Doc = Record<string, unknown>;
interface Form {
  supplier_id: string; vehicle_no: string; fuel_type: string; tank_id: string;
  delivered_qty: string; accepted_qty: string; rate: string;
  additional_charges: string; discount: string; invoice_ref: string;
  paid_now: string; payment_method: string;
}
const blank: Form = {
  supplier_id: "", vehicle_no: "", fuel_type: "petrol", tank_id: "", delivered_qty: "",
  accepted_qty: "", rate: "", additional_charges: "0", discount: "0", invoice_ref: "",
  paid_now: "0", payment_method: "cash",
};

export default function Purchases() {
  const d = useDepot();
  const { user } = useAuth();
  const toast = useToast();
  const { t } = useLang();
  const [form, setForm] = useState<Form | null>(null);
  const [detail, setDetail] = useState<Doc | null>(null);
  const [edit, setEdit] = useState<Doc | null>(null);
  const [q, setQ] = useState("");
  const [fuelF, setFuelF] = useState("");
  const [busy, setBusy] = useState(false);

  function supName(id: unknown) { return String(d.suppliers.find((s) => String(s.id) === id)?.name ?? "—"); }
  function tankName(id: unknown) { return String(d.tanks.find((t) => String(t.id) === id)?.name ?? "—"); }
  const tanksFor = (fuel: string) => d.tanks.filter((t) => String(t.fuel_type) === fuel);

  const rows = useMemo(() => byDateDesc(d.purchases, "created_at").filter((p) =>
    (!fuelF || String(p.fuel_type) === fuelF) &&
    (!q || `${p.ref_no} ${p.vehicle_no} ${p.invoice_ref ?? ""} ${supName(p.supplier_id)}`.toLowerCase().includes(q.toLowerCase()))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.purchases, q, fuelF, d.suppliers]);

  async function submit(f: Form) {
    if (!f.supplier_id || !f.tank_id || !f.accepted_qty || !f.rate) { toast(t.requiredFields, "danger"); return; }
    setBusy(true);
    try {
      await postPurchase({ ...f, accepted_qty: f.accepted_qty, delivered_qty: f.delivered_qty || f.accepted_qty, actor: user?.uid ?? "web" });
      toast(t.purchasePosted); setForm(null);
    } catch (e) { toast((e as Error).message, "danger"); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader eyebrow={t.all} title={t.purchasesTitle} description={t.purchasesDesc}>
        <Button variant="secondary" icon="download" onClick={() => exportCsv("purchases", [
          { header: t.ref, value: (r) => String(r.ref_no) }, { header: t.date, value: (r) => String(r.business_date) },
          { header: t.supplierWord, value: (r) => supName(r.supplier_id) }, { header: t.fuel, value: (r) => fuelLabel(String(r.fuel_type), t) },
          { header: t.quantity, value: (r) => String(r.accepted_qty) }, { header: t.rate, value: (r) => String(r.rate) },
          { header: t.total, value: (r) => String(r.total_amount) }, { header: t.paidLabel, value: (r) => String(r.paid_now) },
        ], rows)}>CSV</Button>
        <Button variant="primary" icon="plus" onClick={() => setForm({ ...blank, tank_id: tanksFor("petrol")[0] ? String(tanksFor("petrol")[0].id) : "" })}>{t.newPurchase}</Button>
      </PageHeader>

      <Card className="filter-card">
        <div className="filter-search"><Icon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchPurchase} /></div>
        <select className="filter-select" value={fuelF} onChange={(e) => setFuelF(e.target.value)}>
          <option value="">{t.allFuel}</option><option value="petrol">{t.petrol}</option><option value="diesel">{t.diesel}</option>
        </select>
      </Card>

      <Card>
        <div className="card-head"><div><h2>{t.purchasesList}</h2><p>{rows.length} {t.records}</p></div></div>
        {rows.length === 0 ? <EmptyState icon="truck" title={t.noPurchases} hint={t.noPurchasesHint} /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>{t.ref}</th><th>{t.date}</th><th>{t.supplierWord}</th><th>{t.fuel}</th><th>{t.tank}</th><th>{t.quantity}</th><th>{t.rate}</th><th>{t.total}</th><th>{t.statusHeader}</th><th></th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={String(p.id)}>
                  <td><button className="record-link" onClick={() => setDetail(p)}>{String(p.ref_no)}</button></td>
                  <td>{fmtDate(String(p.business_date))}</td>
                  <td>{supName(p.supplier_id)}</td>
                  <td>{fuelLabel(String(p.fuel_type), t)}</td>
                  <td>{tankName(p.tank_id)}</td>
                  <td className="num">{qty(p.accepted_qty as string)}</td>
                  <td className="num">{money(p.rate as string)}</td>
                  <td className="num">{money(p.total_amount as string)}</td>
                  <td><StatusBadge status={String(p.status) === "reversed" ? "reversed" : String(p.payment_status)} /></td>
                  <td>
                    <div className="table-tools">
                      <button onClick={() => setEdit(p)} title={t.edit}><Icon name="file" size={13} /></button>
                      <button onClick={async () => {
                        const reason = prompt(t.reverseReason) ?? "";
                        if (!reason) return;
                        try { await reverseTransaction({ entity: "purchases", id: String(p.id), reason, actor: user?.uid ?? "web" }); toast(t.reversedToast); }
                        catch (e) { toast((e as Error).message, "danger"); }
                      }} title={t.reverse}><Icon name="alert" size={13} /></button>
                      <button onClick={async () => {
                        if (!confirm(t.confirmDeletePurchase)) return;
                        try { await deleteRecord("purchases", String(p.id)); toast(t.deleted); }
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

      {form && <PurchaseForm f={form} set={setForm} onSave={submit} busy={busy} suppliers={d.suppliers} tanksFor={tanksFor} onFuel={(fuel) => setForm({ ...form, fuel_type: fuel, tank_id: tanksFor(fuel)[0] ? String(tanksFor(fuel)[0].id) : "" })} />}

      {detail && (
        <Modal title={`${t.purchaseDetail} ${String(detail.ref_no)}`} onClose={() => setDetail(null)} footer={<Button onClick={() => setDetail(null)}>{t.close}</Button>}>
          <div className="review-block"><span>{t.supplierWord}</span><strong>{supName(detail.supplier_id)}</strong><small>{fmtDate(String(detail.business_date))}</small></div>
          <div className="review-block"><span>{t.quantityRate}</span><strong>{qty(detail.accepted_qty as string)} × {money(detail.rate as string)}</strong><small>{t.delivery} {qty(detail.delivered_qty as string)}</small></div>
          <div className="review-block"><span>{t.totalPaid}</span><strong>{money(detail.total_amount as string)}</strong><small>{t.paidLabel} {money(detail.paid_now as string)}</small></div>
        </Modal>
      )}

      {edit && (
        <Modal title={`${t.edit} ${String(edit.ref_no)}`} onClose={() => setEdit(null)} footer={<>
          <Button onClick={() => setEdit(null)}>{t.cancel}</Button>
          <Button variant="primary" onClick={async () => {
            try { await patchRecord("purchases", String(edit.id), { vehicle_no: edit.vehicle_no, invoice_ref: edit.invoice_ref }); toast(t.updated); setEdit(null); }
            catch (e) { toast((e as Error).message, "danger"); }
          }}>{t.save}</Button>
        </>}>
          <div className="form-grid">
            <Field label={t.vehicle}><input value={String(edit.vehicle_no ?? "")} onChange={(e) => setEdit({ ...edit, vehicle_no: e.target.value })} /></Field>
            <Field label={t.supplierInvoice}><input value={String(edit.invoice_ref ?? "")} onChange={(e) => setEdit({ ...edit, invoice_ref: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}

function PurchaseForm({ f, set, onSave, busy, suppliers, tanksFor, onFuel }: {
  f: Form; set: (f: Form | null) => void; onSave: (f: Form) => void; busy: boolean;
  suppliers: Doc[]; tanksFor: (fuel: string) => Doc[]; onFuel: (fuel: string) => void;
}) {
  const { t } = useLang();
  const total = D(f.accepted_qty || "0").mul(D(f.rate || "0")).plus(D(f.additional_charges || "0")).minus(D(f.discount || "0"));
  const balance = total.minus(D(f.paid_now || "0"));
  const tanks = tanksFor(f.fuel_type);
  return (
    <Modal title={t.newPurchaseReceiving} onClose={() => set(null)} footer={<>
      <Button onClick={() => set(null)}>{t.cancel}</Button>
      <Button variant="primary" disabled={busy} onClick={() => onSave(f)}>{t.confirmAndPost}</Button>
    </>}>
      <div className="form-grid">
        <Field label={t.supplierWord} full>
          <select value={f.supplier_id} onChange={(e) => set({ ...f, supplier_id: e.target.value })}>
            <option value="">{t.selectPlaceholder}</option>
            {suppliers.map((s) => <option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>)}
          </select>
        </Field>
        <Field label={t.fuel}><select value={f.fuel_type} onChange={(e) => onFuel(e.target.value)}><option value="petrol">{t.petrol}</option><option value="diesel">{t.diesel}</option></select></Field>
        <Field label={t.tank}>
          <select value={f.tank_id} onChange={(e) => set({ ...f, tank_id: e.target.value })}>
            {tanks.length === 0 && <option value="">{t.noTanks}</option>}
            {tanks.map((t) => <option key={String(t.id)} value={String(t.id)}>{String(t.name)}</option>)}
          </select>
        </Field>
        <Field label={t.vehicleNo}><input className="latin" value={f.vehicle_no} onChange={(e) => set({ ...f, vehicle_no: e.target.value })} placeholder="LEB-1234" /></Field>
        <Field label={t.supplierInvoice}><input className="latin" value={f.invoice_ref} onChange={(e) => set({ ...f, invoice_ref: e.target.value })} /></Field>
        <Field label={t.deliveredQty}><input className="latin" inputMode="decimal" value={f.delivered_qty} onChange={(e) => set({ ...f, delivered_qty: e.target.value })} /></Field>
        <Field label={t.acceptedQty}><input className="latin" inputMode="decimal" value={f.accepted_qty} onChange={(e) => set({ ...f, accepted_qty: e.target.value })} /></Field>
        <Field label={t.ratePerLiter}><input className="latin" inputMode="decimal" value={f.rate} onChange={(e) => set({ ...f, rate: e.target.value })} /></Field>
        <Field label={t.additionalCharges}><input className="latin" inputMode="decimal" value={f.additional_charges} onChange={(e) => set({ ...f, additional_charges: e.target.value })} /></Field>
        <Field label={t.discount}><input className="latin" inputMode="decimal" value={f.discount} onChange={(e) => set({ ...f, discount: e.target.value })} /></Field>
        <Field label={t.paidNow}><input className="latin" inputMode="decimal" value={f.paid_now} onChange={(e) => set({ ...f, paid_now: e.target.value })} /></Field>
        <Field label={t.paymentMethod}>
          <select value={f.payment_method} onChange={(e) => set({ ...f, payment_method: e.target.value })}>
            <option value="cash">{t.methods.cash}</option><option value="bank">{t.methods.bank}</option><option value="other">{t.methods.other}</option>
          </select>
        </Field>
        <Field label={t.referenceInvoice}><input value={f.invoice_ref} onChange={(e) => set({ ...f, invoice_ref: e.target.value })} /></Field>
      </div>
      <div className="allocation">
        <div><span>{t.totalAmount}</span><strong>{money(total)}</strong></div>
        <div><span>{t.balancePayable}</span><strong>{money(balance)}</strong></div>
      </div>
    </Modal>
  );
}
