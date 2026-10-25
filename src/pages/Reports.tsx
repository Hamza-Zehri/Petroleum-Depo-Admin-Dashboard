import { useMemo, useState } from "react";
import { useDepot } from "../lib/store";
import { useLang } from "../lib/lang";
import { Card, PageHeader, Button, EmptyState } from "../components/ui";
import { Icon } from "../components/Icons";
import { D, money, qty, fmtDate, todayIso } from "../lib/format";
import { withinPeriod } from "../lib/repo";
import { categoryLabel, depotDisplayName, fuelLabel, methodLabel } from "../lib/labels";
import { exportCsv, printHtml, reportHeader, escapeHtml } from "../lib/print";

function monthsAgo(n: number) { const x = new Date(); x.setMonth(x.getMonth() - n); x.setDate(1); return x.toISOString().slice(0, 10); }

export default function Reports() {
  const d = useDepot();
  const { t } = useLang();
  const [from, setFrom] = useState(monthsAgo(1));
  const [to, setTo] = useState(todayIso());

  const depot = { name: depotDisplayName(d.settings.depot_name, t), contact: d.settings.depot_contact, address: d.settings.depot_address };
  const sales = useMemo(() => d.sales.filter((s) => withinPeriod(String(s.business_date), from, to) && String(s.status) !== "reversed"), [d.sales, from, to]);
  const purchases = useMemo(() => d.purchases.filter((x) => withinPeriod(String(x.business_date), from, to) && String(x.status) !== "reversed"), [d.purchases, from, to]);
  const expenses = useMemo(() => d.expenses.filter((x) => withinPeriod(String(x.expense_date), from, to) && String(x.status) !== "reversed"), [d.expenses, from, to]);

  function printTable(title: string, head: string[], rows: string[][]) {
    printHtml(title, `${reportHeader(depot, title, `${fmtDate(from)} ${t.until} ${fmtDate(to)}`)}
      <table><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td class="latin">${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
  }

  const reports = [
    {
      key: "sales-register", title: t.salesRegister, desc: t.salesRegisterDesc, icon: "fuel", tone: "tone-success",
      run: () => printTable(t.salesRegister, [t.ref, t.date, t.customerWord, t.fuel, t.quantity, t.rate, t.total, t.due],
        sales.map((s) => [String(s.ref_no), String(s.business_date), custName(s.customer_id), fuelLabel(String(s.fuel_type), t), String(s.quantity), String(s.rate), String(s.total_amount), String(s.due_amount)])),
    },
    {
      key: "purchase-register", title: t.purchaseRegister, desc: t.purchaseRegisterDesc, icon: "truck", tone: "tone-info",
      run: () => printTable(t.purchaseRegister, [t.ref, t.date, t.supplierWord, t.fuel, t.quantity, t.rate, t.total],
        purchases.map((p) => [String(p.ref_no), String(p.business_date), supName(p.supplier_id), fuelLabel(String(p.fuel_type), t), String(p.accepted_qty), String(p.rate), String(p.total_amount)])),
    },
    {
      key: "customer-outstanding", title: t.customerReceivables, desc: t.customerReceivablesDesc, icon: "users", tone: "tone-warning",
      run: () => printTable(t.customerReceivables, [t.customerWord, t.openingBalance, t.invoiced, t.paidLabel, t.due],
        d.customerBalances.filter((b) => b.due.gt(0)).map((b) => [custName(b.customerId), b.opening.toFixed(2), b.invoiced.toFixed(2), b.paid.toFixed(2), b.due.toFixed(2)])),
    },
    {
      key: "supplier-outstanding", title: t.supplierPayables, desc: t.supplierPayablesDesc, icon: "box", tone: "tone-danger",
      run: () => printTable(t.supplierPayables, [t.supplierWord, t.openingBalance, t.purchasesLabel, t.paidLabel, t.balancePayable],
        d.supplierBalances.filter((b) => b.due.gt(0)).map((b) => [supName(b.supplierId), b.opening.toFixed(2), b.purchases.toFixed(2), b.paid.toFixed(2), b.due.toFixed(2)])),
    },
    {
      key: "stock", title: t.stockStatement, desc: t.stockStatementDesc, icon: "tank", tone: "tone-info",
      run: () => printTable(t.stockStatement, [t.tank, t.fuel, t.openingBalance, t.inLabel, t.outLabel, t.adjustLabel, t.bookLabel],
        d.stocks.map((s) => [s.name, fuelLabel(s.fuel, t), s.opening.toFixed(2), s.received.toFixed(2), s.dispatched.toFixed(2), s.adjusted.toFixed(2), s.book.toFixed(2)])),
    },
    {
      key: "expenses", title: t.expenseRegister, desc: t.expenseRegisterDesc, icon: "download", tone: "tone-warning",
      run: () => printTable(t.expenseRegister, [t.ref, t.date, t.category, t.method, t.amount, t.description],
        expenses.map((x) => [String(x.ref_no), String(x.expense_date), categoryLabel(String(x.category), t), methodLabel(String(x.method), t), String(x.amount), String(x.description ?? "")])),
    },
  ];

  function custName(id: unknown) { return String(d.customers.find((c) => String(c.id) === id)?.name ?? "—"); }
  function supName(id: unknown) { return String(d.suppliers.find((s) => String(s.id) === id)?.name ?? "—"); }

  return (
    <>
      <PageHeader eyebrow={t.all} title={t.reportsTitle} description={t.reportsDesc}>
        <input className="date-control latin" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="date-control latin" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </PageHeader>

      <div className="report-grid">
        {reports.map((r) => (
          <Card key={r.key} className="report-card">
            <span className={`report-icon ${r.tone}`}><Icon name={r.icon} size={18} /></span>
            <div><h2>{r.title}</h2><p>{r.desc}</p></div>
            <div className="card-actions">
              <Button icon="print" onClick={r.run}>{t.print}</Button>
            </div>
          </Card>
        ))}
      </div>

      <Card style={{ marginTop: 14 }}>
        <div className="card-head"><div><h2>{t.transactions}</h2><p>{sales.length + purchases.length + expenses.length} {t.entries}</p></div>
          <Button variant="secondary" icon="download" onClick={() => exportCsv<Record<string, unknown>>("transactions", [
            { header: t.category, value: (r) => String(r.kind) }, { header: t.ref, value: (r) => String(r.ref_no) },
            { header: t.date, value: (r) => String(r.business_date ?? r.expense_date) }, { header: t.amount, value: (r) => String(r.total_amount ?? r.amount) },
          ], [...sales.map((s) => ({ ...s, kind: t.saleWord })), ...purchases.map((p) => ({ ...p, kind: t.purchaseWord })), ...expenses.map((e) => ({ ...e, kind: t.expenseWord }))] as Record<string, unknown>[])}>CSV</Button>
        </div>
        {sales.length + purchases.length + expenses.length === 0 ? <EmptyState icon="file" title={t.noDataInPeriod} /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>{t.category}</th><th>{t.ref}</th><th>{t.date}</th><th>{t.description}</th><th>{t.amount}</th></tr></thead>
            <tbody>
              {[...sales.map((s) => ({ id: String(s.id), kind: t.saleWord, ref: String(s.ref_no), date: String(s.business_date), desc: custName(s.customer_id), amt: D(s.total_amount as string) })),
              ...purchases.map((p) => ({ id: String(p.id), kind: t.purchaseWord, ref: String(p.ref_no), date: String(p.business_date), desc: supName(p.supplier_id), amt: D(p.total_amount as string) })),
              ...expenses.map((x) => ({ id: String(x.id), kind: t.expenseWord, ref: String(x.ref_no), date: String(x.expense_date), desc: categoryLabel(String(x.category), t), amt: D(x.amount as string) }))]
                .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200)
                .map((r) => (
                  <tr key={r.id}>
                    <td>{r.kind}</td><td className="latin">{r.ref}</td><td>{fmtDate(r.date)}</td><td>{r.desc}</td><td className="num">{money(r.amt)}</td>
                  </tr>
                ))}
            </tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}
