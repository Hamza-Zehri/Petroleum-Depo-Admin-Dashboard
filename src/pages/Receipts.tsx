import { useMemo, useState } from "react";
import { useDepot } from "../lib/store";
import { useLang } from "../lib/lang";
import { Card, Button, PageHeader, EmptyState } from "../components/ui";
import { Icon } from "../components/Icons";
import { D, money, qty, fmtDate } from "../lib/format";
import { depotDisplayName, fuelLabel, methodLabel } from "../lib/labels";
import { printHtml, reportHeader, escapeHtml } from "../lib/print";

type Kind = "sale" | "purchase" | "customer_payment" | "supplier_payment";

export default function Receipts() {
  const d = useDepot();
  const { t } = useLang();
  const [kind, setKind] = useState<Kind>("sale");
  const [q, setQ] = useState("");

  const depot = { name: depotDisplayName(d.settings.depot_name, t), contact: d.settings.depot_contact, address: d.settings.depot_address };

  const rows = useMemo(() => {
    const kw = q.toLowerCase();
    if (kind === "sale") return d.sales.filter((s) => !kw || String(s.ref_no).toLowerCase().includes(kw) || custName(s.customer_id).toLowerCase().includes(kw));
    if (kind === "purchase") return d.purchases.filter((p) => !kw || String(p.ref_no).toLowerCase().includes(kw) || supName(p.supplier_id).toLowerCase().includes(kw));
    if (kind === "customer_payment") return d.customerPayments.filter((p) => !kw || String(p.ref_no).toLowerCase().includes(kw) || custName(p.customer_id).toLowerCase().includes(kw));
    return d.supplierPayments.filter((p) => !kw || String(p.ref_no).toLowerCase().includes(kw) || supName(p.supplier_id).toLowerCase().includes(kw));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, q, d.sales, d.purchases, d.customerPayments, d.supplierPayments]);

  function custName(id: unknown) { return String(d.customers.find((c) => String(c.id) === id)?.name ?? "—"); }
  function supName(id: unknown) { return String(d.suppliers.find((s) => String(s.id) === id)?.name ?? "—"); }

  function print(r: Record<string, unknown>) {
    if (kind === "sale") {
      printHtml(`${t.saleReceipt} ${String(r.ref_no)}`, `${reportHeader(depot, t.saleReceipt, String(r.ref_no))}
        <table><tr><th>${t.customerWord}</th><td>${escapeHtml(custName(r.customer_id))}</td><th>${t.vehicle}</th><td class="latin">${escapeHtml(r.vehicle_no)}</td></tr>
        <tr><th>${t.fuel}</th><td>${escapeHtml(fuelLabel(String(r.fuel_type), t))}</td><th>${t.date}</th><td class="latin">${escapeHtml(fmtDate(String(r.business_date)))}</td></tr>
        <tr><th>${t.quantity}</th><td class="latin">${escapeHtml(qty(r.quantity as string))}</td><th>${t.rate}</th><td class="latin">${escapeHtml(money(r.rate as string))}</td></tr>
        <tr class="total"><th>${t.total}</th><td class="latin">${escapeHtml(money(r.total_amount as string))}</td><th>${t.due}</th><td class="latin">${escapeHtml(money(r.due_amount as string))}</td></tr></table>`);
    } else if (kind === "purchase") {
      printHtml(`${t.purchaseReceipt} ${String(r.ref_no)}`, `${reportHeader(depot, t.purchaseReceipt, String(r.ref_no))}
        <table><tr><th>${t.supplierWord}</th><td>${escapeHtml(supName(r.supplier_id))}</td><th>${t.date}</th><td class="latin">${escapeHtml(fmtDate(String(r.business_date)))}</td></tr>
        <tr><th>${t.quantity}</th><td class="latin">${escapeHtml(qty(r.accepted_qty as string))}</td><th>${t.rate}</th><td class="latin">${escapeHtml(money(r.rate as string))}</td></tr>
        <tr class="total"><th>${t.total}</th><td class="latin">${escapeHtml(money(r.total_amount as string))}</td><th>${t.paidLabel}</th><td class="latin">${escapeHtml(money(r.paid_now as string))}</td></tr></table>`);
    } else {
      const who = kind === "customer_payment" ? custName(r.customer_id) : supName(r.supplier_id);
      printHtml(`${t.paymentReceipt} ${String(r.ref_no)}`, `${reportHeader(depot, t.paymentReceipt, String(r.ref_no))}
        <table><tr><th>${kind === "customer_payment" ? t.customerWord : t.supplierWord}</th><td>${escapeHtml(who)}</td><th>${t.date}</th><td class="latin">${escapeHtml(fmtDate(String(r.business_date)))}</td></tr>
        <tr class="total"><th>${t.amount}</th><td class="latin">${escapeHtml(money(r.amount as string))}</td><th>${t.paymentMethod}</th><td>${escapeHtml(methodLabel(String(r.method ?? ""), t))}</td></tr></table>`);
    }
  }

  return (
    <>
      <PageHeader eyebrow={t.all} title={t.receiptsTitle} description={t.receiptsDesc} />

      <div className="section-tabs">
        {([["sale", t.salesTitle], ["purchase", t.purchasesTitle], ["customer_payment", t.customerPayment], ["supplier_payment", t.supplierPayment]] as [Kind, string][]).map(([k, label]) => (
          <button key={k} className={kind === k ? "active" : ""} onClick={() => setKind(k)}>{label}</button>
        ))}
      </div>

      <Card className="filter-card">
        <div className="filter-search"><Icon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchRefName} /></div>
      </Card>

      <Card>
        <div className="card-head"><div><h2>{t.receiptsList}</h2><p>{rows.length} {t.records}</p></div></div>
        {rows.length === 0 ? <EmptyState icon="print" title={t.noRecords} /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>{t.ref}</th><th>{t.date}</th><th>{t.details}</th><th>{t.amount}</th><th></th></tr></thead>
            <tbody>
              {rows.slice(0, 100).map((r) => (
                <tr key={String(r.id)}>
                  <td className="latin">{String(r.ref_no)}</td>
                  <td>{fmtDate(String(r.business_date ?? r.expense_date))}</td>
                  <td>{kind === "sale" ? custName(r.customer_id) : kind === "purchase" ? supName(r.supplier_id) : kind === "customer_payment" ? custName(r.customer_id) : supName(r.supplier_id)}</td>
                  <td className="num">{money((kind === "sale" || kind === "purchase" ? r.total_amount : r.amount) as string)}</td>
                  <td><Button icon="print" onClick={() => print(r)}>{t.print}</Button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}
