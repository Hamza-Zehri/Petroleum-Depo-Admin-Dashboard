import { useMemo, useState } from "react";
import { useDepot } from "../lib/store";
import { Card, Button, PageHeader, Modal, Field, StatusBadge, EmptyState, useToast } from "../components/ui";
import { Icon } from "../components/Icons";
import { D, money, qty, fmtDate, fmtDateTime, moneyCompact } from "../lib/format";
import { patchRecord, deleteRecord, byDateDesc } from "../lib/repo";
import { postSale, reverseTransaction } from "../lib/posting";
import { useAuth } from "../lib/auth";
import { useLang } from "../lib/lang";
import { exportCsv, printHtml, reportHeader, escapeHtml } from "../lib/print";

type Doc = Record<string, unknown>;
interface Form {
  customer_id: string; vehicle_no: string; driver_name: string; fuel_type: string; tank_id: string;
  quantity: string; rate: string; additional_charges: string; discount: string;
  amount_received: string; payment_type: "cash" | "credit" | "partial";
}
const blank: Form = {
  customer_id: "", vehicle_no: "", driver_name: "", fuel_type: "petrol", tank_id: "",
  quantity: "", rate: "", additional_charges: "0", discount: "0", amount_received: "", payment_type: "cash",
};

export default function Sales() {
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

  function custName(id: unknown) { return String(d.customers.find((c) => String(c.id) === id)?.name ?? "—"); }
  function tankName(id: unknown) { return String(d.tanks.find((t) => String(t.id) === id)?.name ?? "—"); }
  const tanksFor = (fuel: string) => d.tanks.filter((t) => String(t.fuel_type) === fuel);

  const rows = useMemo(() => byDateDesc(d.sales, "created_at").filter((s) =>
    (!fuelF || String(s.fuel_type) === fuelF) &&
    (!q || `${s.ref_no} ${s.vehicle_no} ${custName(s.customer_id)}`.toLowerCase().includes(q.toLowerCase()))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.sales, q, fuelF, d.customers]);

  async function submit(f: Form) {
    if (!f.customer_id || !f.tank_id || !f.quantity || !f.rate) { toast("تمام لازمی خانے بھریں", "danger"); return; }
    setBusy(true);
    try {
      const cost = d.costPerLitre(f.fuel_type).toFixed(4);
      await postSale({ ...f, cost_per_liter: cost, actor: user?.uid ?? "web" });
      toast("فروخت درج ہو گئی"); setForm(null);
    } catch (e) { toast((e as Error).message, "danger"); } finally { setBusy(false); }
  }

  function printSale(s: Doc) {
    const depot = { name: d.settings.depot_name || "پٹرولیم ڈپو", contact: d.settings.depot_contact, address: d.settings.depot_address };
    const total = D(s.total_amount as string);
    printHtml(`رسید ${String(s.ref_no)}`, `${reportHeader(depot, "فروخت رسید", String(s.ref_no))}
      <table><tr><th>گاہک</th><td>${escapeHtml(custName(s.customer_id))}</td><th>گاڑی</th><td class="latin">${escapeHtml(s.vehicle_no)}</td></tr>
      <tr><th>ایندھن</th><td>${String(s.fuel_type) === "petrol" ? "پٹرول" : "ڈیزل"}</td><th>ٹینک</th><td>${escapeHtml(tankName(s.tank_id))}</td></tr>
      <tr><th>مقدار</th><td class="latin">${escapeHtml(qty(s.quantity as string))}</td><th>ریٹ</th><td class="latin">${escapeHtml(money(s.rate as string))}</td></tr>
      <tr><th>کل</th><td class="latin">${escapeHtml(money(total))}</td><th>وصول</th><td class="latin">${escapeHtml(money(s.amount_received as string))}</td></tr>
      <tr><th>باقی</th><td class="latin">${escapeHtml(money(s.due_amount as string))}</td><th>تاریخ</th><td class="latin">${escapeHtml(fmtDate(String(s.business_date)))}</td></tr></table>
      <p class="muted">${escapeHtml(depot.address ?? "")} · ${escapeHtml(depot.contact ?? "")}</p>`);
  }

  return (
    <>
      <PageHeader eyebrow={t.all} title={t.salesTitle} description={t.salesDesc}>
        <Button variant="secondary" icon="download" onClick={() => exportCsv("sales", [
          { header: "Ref", value: (r) => String(r.ref_no) }, { header: "Date", value: (r) => String(r.business_date) },
          { header: "Customer", value: (r) => custName(r.customer_id) }, { header: "Fuel", value: (r) => String(r.fuel_type) },
          { header: "Qty", value: (r) => String(r.quantity) }, { header: "Rate", value: (r) => String(r.rate) },
          { header: "Total", value: (r) => String(r.total_amount) }, { header: "Received", value: (r) => String(r.amount_received) },
          { header: "Due", value: (r) => String(r.due_amount) },
        ], rows)}>CSV</Button>
        <Button variant="primary" icon="plus" onClick={() => setForm({ ...blank, tank_id: tanksFor("petrol")[0] ? String(tanksFor("petrol")[0].id) : "" })}>نئی بھرائی</Button>
      </PageHeader>

      <Card className="filter-card">
        <div className="filter-search"><Icon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="حوالہ، گاڑی، گاہک تلاش کریں" /></div>
        <select className="filter-select" value={fuelF} onChange={(e) => setFuelF(e.target.value)}>
          <option value="">تمام ایندھن</option><option value="petrol">پٹرول</option><option value="diesel">ڈیزل</option>
        </select>
      </Card>

      <Card>
        <div className="card-head"><div><h2>فروخت</h2><p>{rows.length} ریکارڈ</p></div></div>
        {rows.length === 0 ? <EmptyState icon="fuel" title="کوئی فروخت نہیں" hint="نئی بھرائی درج کریں۔" /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>حوالہ</th><th>تاریخ</th><th>گاہک</th><th>گاڑی</th><th>ایندھن</th><th>مقدار</th><th>ریٹ</th><th>کل</th><th>باقی</th><th></th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={String(s.id)}>
                  <td><button className="record-link" onClick={() => setDetail(s)}>{String(s.ref_no)}</button></td>
                  <td>{fmtDate(String(s.business_date))}</td>
                  <td>{custName(s.customer_id)}</td>
                  <td className="latin">{String(s.vehicle_no ?? "—")}</td>
                  <td>{String(s.fuel_type) === "petrol" ? "پٹرول" : "ڈیزل"}</td>
                  <td className="num">{qty(s.quantity as string)}</td>
                  <td className="num">{money(s.rate as string)}</td>
                  <td className="num">{money(s.total_amount as string)}</td>
                  <td className="num">{D(s.due_amount as string).gt(0) ? money(s.due_amount as string) : <StatusBadge status="paid" />}</td>
                  <td>
                    <div className="table-tools">
                      <button onClick={() => printSale(s)} title="پرنٹ"><Icon name="print" size={13} /></button>
                      <button onClick={() => setEdit(s)} title="ترمیم"><Icon name="file" size={13} /></button>
                      <button onClick={async () => {
                        const reason = prompt("منسوخی کی وجہ؟") ?? "";
                        if (!reason) return;
                        try { await reverseTransaction({ entity: "sales", id: String(s.id), reason, actor: user?.uid ?? "web" }); toast("منسوخ کر دیا گیا"); }
                        catch (e) { toast((e as Error).message, "danger"); }
                      }} title="منسوخ"><Icon name="alert" size={13} /></button>
                      <button onClick={async () => {
                        if (!confirm("رکارڈ حذف کریں؟")) return;
                        try { await deleteRecord("sales", String(s.id)); toast("حذف ہو گیا"); }
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

      {form && <SaleForm f={form} set={setForm} onSave={submit} busy={busy} customers={d.customers} vehicles={d.vehicles} tanksFor={tanksFor} cost={d.costPerLitre(form.fuel_type)} onFuel={(fuel) => setForm({ ...form, fuel_type: fuel, tank_id: tanksFor(fuel)[0] ? String(tanksFor(fuel)[0].id) : "" })} />}

      {detail && (
        <Modal title={`فروخت ${String(detail.ref_no)}`} onClose={() => setDetail(null)} footer={<>
          <Button icon="print" onClick={() => printSale(detail)}>پرنٹ</Button>
          <Button onClick={() => setDetail(null)}>بند کریں</Button>
        </>}>
          <div className="review-block"><span>گاہک</span><strong>{custName(detail.customer_id)}</strong><small>{String(detail.vehicle_no ?? "—")} · {fmtDate(String(detail.business_date))}</small></div>
          <div className="review-block"><span>مقدار / ریٹ</span><strong>{qty(detail.quantity as string)} × {money(detail.rate as string)}</strong></div>
          <div className="review-block"><span>کل / وصول / باقی</span><strong>{money(detail.total_amount as string)}</strong><small>وصول {money(detail.amount_received as string)} · باقی {money(detail.due_amount as string)}</small></div>
        </Modal>
      )}

      {edit && (
        <Modal title={`ترمیم ${String(edit.ref_no)}`} onClose={() => setEdit(null)} footer={<>
          <Button onClick={() => setEdit(null)}>منسوخ</Button>
          <Button variant="primary" onClick={async () => {
            try { await patchRecord("sales", String(edit.id), { vehicle_no: edit.vehicle_no, driver_name: edit.driver_name }); toast("اپ ڈیٹ"); setEdit(null); }
            catch (e) { toast((e as Error).message, "danger"); }
          }}>محفوظ</Button>
        </>}>
          <div className="form-grid">
            <Field label="گاڑی"><input value={String(edit.vehicle_no ?? "")} onChange={(e) => setEdit({ ...edit, vehicle_no: e.target.value })} /></Field>
            <Field label="ڈرائیور"><input value={String(edit.driver_name ?? "")} onChange={(e) => setEdit({ ...edit, driver_name: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}

function SaleForm({ f, set, onSave, busy, customers, vehicles, tanksFor, cost, onFuel }: {
  f: Form; set: (f: Form | null) => void; onSave: (f: Form) => void; busy: boolean;
  customers: Doc[]; vehicles: Doc[]; tanksFor: (fuel: string) => Doc[]; cost: ReturnType<typeof D>; onFuel: (fuel: string) => void;
}) {
  const total = D(f.quantity || "0").mul(D(f.rate || "0")).plus(D(f.additional_charges || "0")).minus(D(f.discount || "0"));
  const received = D(f.amount_received || "0");
  const due = DecimalMax(total.minus(received));
  const cogs = D(f.quantity || "0").mul(cost);
  const tanks = tanksFor(f.fuel_type);
  const custVehicles = vehicles.filter((v) => String(v.customer_id) === f.customer_id);

  return (
    <Modal title="نئی ایندھن بھرائی" onClose={() => set(null)} footer={<>
      <Button onClick={() => set(null)}>منسوخ</Button>
      <Button variant="primary" disabled={busy} onClick={() => onSave(f)}>تصدیق و درج کریں</Button>
    </>}>
      <div className="form-grid">
        <Field label="گاہک" full>
          <select value={f.customer_id} onChange={(e) => set({ ...f, customer_id: e.target.value, vehicle_no: "" })}>
            <option value="">گاہک منتخب کریں</option>
            {customers.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.name)}</option>)}
          </select>
        </Field>
        <Field label="گاڑی (رجسٹر شدہ)">
          <select value={f.vehicle_no} onChange={(e) => set({ ...f, vehicle_no: e.target.value })}>
            <option value="">— منتخب کریں —</option>
            {custVehicles.map((v) => <option key={String(v.id)} value={String(v.reg_no)}>{String(v.reg_no)}</option>)}
          </select>
        </Field>
        <Field label="گاڑی نمبر"><input className="latin" value={f.vehicle_no} onChange={(e) => set({ ...f, vehicle_no: e.target.value })} /></Field>
        <Field label="ڈرائیور"><input value={f.driver_name} onChange={(e) => set({ ...f, driver_name: e.target.value })} /></Field>
        <Field label="ایندھن">
          <select value={f.fuel_type} onChange={(e) => onFuel(e.target.value)}>
            <option value="petrol">پٹرول</option><option value="diesel">ڈیزل</option>
          </select>
        </Field>
        <Field label="ٹینک">
          <select value={f.tank_id} onChange={(e) => set({ ...f, tank_id: e.target.value })}>
            {tanks.map((t) => <option key={String(t.id)} value={String(t.id)}>{String(t.name)}</option>)}
          </select>
        </Field>
        <Field label="مقدار (لیٹر)"><input className="latin" inputMode="decimal" value={f.quantity} onChange={(e) => set({ ...f, quantity: e.target.value })} /></Field>
        <Field label="ریٹ فی لیٹر"><input className="latin" inputMode="decimal" value={f.rate} onChange={(e) => set({ ...f, rate: e.target.value })} /></Field>
        <Field label="اضافی چارجز"><input className="latin" inputMode="decimal" value={f.additional_charges} onChange={(e) => set({ ...f, additional_charges: e.target.value })} /></Field>
        <Field label="رعایت"><input className="latin" inputMode="decimal" value={f.discount} onChange={(e) => set({ ...f, discount: e.target.value })} /></Field>
        <Field label="ادات کی قسم">
          <select value={f.payment_type} onChange={(e) => {
            const pt = e.target.value as Form["payment_type"];
            set({ ...f, payment_type: pt, amount_received: pt === "cash" ? total.toFixed(2) : pt === "credit" ? "0" : f.amount_received });
          }}>
            <option value="cash">نقد</option><option value="credit">ادھار</option><option value="partial">جزوی</option>
          </select>
        </Field>
        <Field label="وصول شدہ رقم"><input className="latin" inputMode="decimal" value={f.amount_received} onChange={(e) => set({ ...f, amount_received: e.target.value })} /></Field>
      </div>
      <div className="allocation">
        <div><span>کل رقم</span><strong>{money(total)}</strong></div>
        <div><span>باقی (ادھار)</span><strong>{money(due)}</strong></div>
      </div>
      <div className="review-block"><span>لاگت (وزنی اوسط)</span><strong>{moneyCompact(cogs)}</strong><small>فی لیٹر {money(cost)}</small></div>
    </Modal>
  );
}

function DecimalMax(v: ReturnType<typeof D>) { return v.gt(0) ? v : D(0); }
