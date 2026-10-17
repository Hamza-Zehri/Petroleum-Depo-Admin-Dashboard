import { useMemo, useState } from "react";
import { useDepot } from "../lib/store";
import { Card, PageHeader, Button, EmptyState } from "../components/ui";
import { Icon } from "../components/Icons";
import { D, money, qty, fmtDate, todayIso } from "../lib/format";
import { withinPeriod } from "../lib/repo";
import { exportCsv, printHtml, reportHeader, escapeHtml } from "../lib/print";

function monthsAgo(n: number) { const x = new Date(); x.setMonth(x.getMonth() - n); x.setDate(1); return x.toISOString().slice(0, 10); }

export default function Reports() {
  const d = useDepot();
  const [from, setFrom] = useState(monthsAgo(1));
  const [to, setTo] = useState(todayIso());

  const depot = { name: d.settings.depot_name || "پٹرولیم ڈپو", contact: d.settings.depot_contact, address: d.settings.depot_address };
  const sales = useMemo(() => d.sales.filter((s) => withinPeriod(String(s.business_date), from, to) && String(s.status) !== "reversed"), [d.sales, from, to]);
  const purchases = useMemo(() => d.purchases.filter((x) => withinPeriod(String(x.business_date), from, to) && String(x.status) !== "reversed"), [d.purchases, from, to]);
  const expenses = useMemo(() => d.expenses.filter((x) => withinPeriod(String(x.expense_date), from, to) && String(x.status) !== "reversed"), [d.expenses, from, to]);

  function printTable(title: string, head: string[], rows: string[][]) {
    printHtml(title, `${reportHeader(depot, title, `${fmtDate(from)} تا ${fmtDate(to)}`)}
      <table><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td class="latin">${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
  }

  const reports = [
    {
      key: "sales-register", title: "فروخت رجسٹر", desc: "مدت کی تمام فروخت", icon: "fuel", tone: "tone-success",
      run: () => printTable("فروخت رجسٹر", ["Ref", "Date", "Customer", "Fuel", "Qty", "Rate", "Total", "Due"],
        sales.map((s) => [String(s.ref_no), String(s.business_date), custName(s.customer_id), String(s.fuel_type), String(s.quantity), String(s.rate), String(s.total_amount), String(s.due_amount)])),
    },
    {
      key: "purchase-register", title: "خریداری رجسٹر", desc: "مدت کی تمام خریداری", icon: "truck", tone: "tone-info",
      run: () => printTable("خریداری رجسٹر", ["Ref", "Date", "Supplier", "Fuel", "Qty", "Rate", "Total"],
        purchases.map((p) => [String(p.ref_no), String(p.business_date), supName(p.supplier_id), String(p.fuel_type), String(p.accepted_qty), String(p.rate), String(p.total_amount)])),
    },
    {
      key: "customer-outstanding", title: "گاہک وصولی", desc: "باقی ادھار", icon: "users", tone: "tone-warning",
      run: () => printTable("گاہک وصولی", ["Customer", "Opening", "Invoiced", "Paid", "Due"],
        d.customerBalances.filter((b) => b.due.gt(0)).map((b) => [custName(b.customerId), b.opening.toFixed(2), b.invoiced.toFixed(2), b.paid.toFixed(2), b.due.toFixed(2)])),
    },
    {
      key: "supplier-outstanding", title: "سپلائر دینا", desc: "واجب الادا", icon: "box", tone: "tone-danger",
      run: () => printTable("سپلائر دینا", ["Supplier", "Opening", "Purchases", "Paid", "Payable"],
        d.supplierBalances.filter((b) => b.due.gt(0)).map((b) => [supName(b.supplierId), b.opening.toFixed(2), b.purchases.toFixed(2), b.paid.toFixed(2), b.due.toFixed(2)])),
    },
    {
      key: "stock", title: "اسٹاک گوشوارہ", desc: "ٹینک وار موجودہ اسٹاک", icon: "tank", tone: "tone-info",
      run: () => printTable("اسٹاک گوشوارہ", ["Tank", "Fuel", "Opening", "In", "Out", "Adjust", "Book"],
        d.stocks.map((s) => [s.name, s.fuel, s.opening.toFixed(2), s.received.toFixed(2), s.dispatched.toFixed(2), s.adjusted.toFixed(2), s.book.toFixed(2)])),
    },
    {
      key: "expenses", title: "اخراجات رجسٹر", desc: "مدت کے اخراجات", icon: "download", tone: "tone-warning",
      run: () => printTable("اخراجات رجسٹر", ["Ref", "Date", "Category", "Method", "Amount", "Desc"],
        expenses.map((x) => [String(x.ref_no), String(x.expense_date), String(x.category), String(x.method), String(x.amount), String(x.description ?? "")])),
    },
  ];

  function custName(id: unknown) { return String(d.customers.find((c) => String(c.id) === id)?.name ?? "—"); }
  function supName(id: unknown) { return String(d.suppliers.find((s) => String(s.id) === id)?.name ?? "—"); }

  return (
    <>
      <PageHeader eyebrow="ڈپو" title="رپورٹس" description="قابلِ پرنٹ و برآمد کاروباری گوشوارے">
        <input className="date-control latin" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="date-control latin" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </PageHeader>

      <div className="report-grid">
        {reports.map((r) => (
          <Card key={r.key} className="report-card">
            <span className={`report-icon ${r.tone}`}><Icon name={r.icon} size={18} /></span>
            <div><h2>{r.title}</h2><p>{r.desc}</p></div>
            <div className="card-actions">
              <Button icon="print" onClick={r.run}>پرنٹ</Button>
            </div>
          </Card>
        ))}
      </div>

      <Card style={{ marginTop: 14 }}>
        <div className="card-head"><div><h2>لین دین کی تاریخ (ٹرانزیکشن ہسٹری)</h2><p>{sales.length + purchases.length + expenses.length} اندراج</p></div>
          <Button variant="secondary" icon="download" onClick={() => exportCsv<Record<string, unknown>>("transactions", [
            { header: "Kind", value: (r) => String(r.kind) }, { header: "Ref", value: (r) => String(r.ref_no) },
            { header: "Date", value: (r) => String(r.business_date ?? r.expense_date) }, { header: "Amount", value: (r) => String(r.total_amount ?? r.amount) },
          ], [...sales.map((s) => ({ ...s, kind: "sale" })), ...purchases.map((p) => ({ ...p, kind: "purchase" })), ...expenses.map((e) => ({ ...e, kind: "expense" }))] as Record<string, unknown>[])}>CSV</Button>
        </div>
        {sales.length + purchases.length + expenses.length === 0 ? <EmptyState icon="file" title="اس مدت میں کوئی ڈیٹا نہیں" /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>قسم</th><th>حوالہ</th><th>تاریخ</th><th>تفصیل</th><th>رقم</th></tr></thead>
            <tbody>
              {[...sales.map((s) => ({ id: String(s.id), kind: "فروخت", ref: String(s.ref_no), date: String(s.business_date), desc: custName(s.customer_id), amt: D(s.total_amount as string) })),
              ...purchases.map((p) => ({ id: String(p.id), kind: "خریداری", ref: String(p.ref_no), date: String(p.business_date), desc: supName(p.supplier_id), amt: D(p.total_amount as string) })),
              ...expenses.map((x) => ({ id: String(x.id), kind: "خرچ", ref: String(x.ref_no), date: String(x.expense_date), desc: String(x.category), amt: D(x.amount as string) }))]
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
