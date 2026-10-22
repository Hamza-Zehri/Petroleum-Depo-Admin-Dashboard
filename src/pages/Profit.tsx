import { useMemo, useState } from "react";
import { useDepot } from "../lib/store";
import { useLang } from "../lib/lang";
import { Card, PageHeader, Button, EmptyState } from "../components/ui";
import { D, money, moneyCompact, qty, fmtDate, todayIso } from "../lib/format";
import { withinPeriod } from "../lib/repo";
import { exportCsv, printHtml, reportHeader } from "../lib/print";

function monthsAgo(n: number) { const x = new Date(); x.setMonth(x.getMonth() - n); x.setDate(1); return x.toISOString().slice(0, 10); }

export default function Profit() {
  const d = useDepot();
  const { t } = useLang();
  const [from, setFrom] = useState(monthsAgo(1));
  const [to, setTo] = useState(todayIso());

  const pnl = useMemo(() => {
    const sales = d.sales.filter((s) => withinPeriod(String(s.business_date), from, to) && String(s.status) !== "reversed");
    const expenses = d.expenses.filter((x) => withinPeriod(String(x.expense_date), from, to) && String(x.status) !== "reversed");
    const revenue = sales.reduce((a, s) => a.plus(D(s.total_amount as string)), D(0));
    const cogs = sales.reduce((a, s) => a.plus(D(s.cost_of_goods as string)), D(0));
    const gross = revenue.minus(cogs);
    const expenseTotal = expenses.reduce((a, x) => a.plus(D(x.amount as string)), D(0));
    return { revenue, cogs, gross, expenseTotal, net: gross.minus(expenseTotal), salesCount: sales.length };
  }, [d.sales, d.expenses, from, to]);

  const totalPurchase = useMemo(() => d.purchases
    .filter((x) => withinPeriod(String(x.business_date), from, to) && String(x.status) !== "reversed")
    .reduce((a, x) => a.plus(D(x.total_amount as string)), D(0)), [d.purchases, from, to]);

  const fuelRows = useMemo(() => (["petrol", "diesel"] as const).map((fuel) => {
    const sales = d.sales.filter((s) => withinPeriod(String(s.business_date), from, to) && String(s.fuel_type) === fuel && String(s.status) !== "reversed");
    const revenue = sales.reduce((a, s) => a.plus(D(s.total_amount as string)), D(0));
    const cogs = sales.reduce((a, s) => a.plus(D(s.cost_of_goods as string)), D(0));
    const litres = sales.reduce((a, s) => a.plus(D(s.quantity as string)), D(0));
    const margin = litres.gt(0) ? revenue.minus(cogs).div(litres) : D(0);
    return { fuel, revenue, cogs, gross: revenue.minus(cogs), litres, margin };
  }), [d.sales, from, to]);

  function printStatement() {
    const depot = { name: d.settings.depot_name || "پٹرولیم ڈپو", contact: d.settings.depot_contact, address: d.settings.depot_address };
    printHtml("نفع و نقصان گوشوارہ", `${reportHeader(depot, "نفع و نقصان گوشوارہ", `${fmtDate(from)} تا ${fmtDate(to)}`)}
      <table>
        <tr><th>کل فروخت (آمدنی)</th><td class="latin">${money(pnl.revenue)}</td></tr>
        <tr><th>منہا: لاگتِ مال (COGS)</th><td class="latin">${money(pnl.cogs)}</td></tr>
        <tr class="total"><th>مجموعی نفع</th><td class="latin">${money(pnl.gross)}</td></tr>
        <tr><th>منہا: اخراجات</th><td class="latin">${money(pnl.expenseTotal)}</td></tr>
        <tr class="total"><th>خالص نفع</th><td class="latin">${money(pnl.net)}</td></tr>
      </table>`);
  }

  const marginPctNum = pnl.revenue.gt(0) ? pnl.gross.div(pnl.revenue).mul(100).toFixed(1) : "0.0";

  return (
    <>
      <PageHeader eyebrow={t.all} title={t.profitTitle} description={t.profitDesc}>
        <input className="date-control latin" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="date-control latin" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button variant="secondary" icon="download" onClick={() => exportCsv("profit", [
          { header: "Metric", value: (r) => r.k }, { header: "Amount", value: (r) => r.v },
        ], [{ k: "Revenue", v: pnl.revenue.toFixed(2) }, { k: "COGS", v: pnl.cogs.toFixed(2) }, { k: "Gross", v: pnl.gross.toFixed(2) }, { k: "Expenses", v: pnl.expenseTotal.toFixed(2) }, { k: "Net", v: pnl.net.toFixed(2) }])}>CSV</Button>
        <Button variant="primary" icon="print" onClick={printStatement}>پرنٹ</Button>
      </PageHeader>

      <div className="profit-strip">
        <div><span>کل آمدنی</span><strong>{moneyCompact(pnl.revenue)}</strong></div>
        <div><span>لاگتِ مال</span><strong>{moneyCompact(pnl.cogs)}</strong></div>
        <div><span>مجموعی نفع</span><strong>{moneyCompact(pnl.gross)}</strong><span className="badge badge-success">{marginPctNum}% مارجن</span></div>
        <div><span>اخراجات</span><strong>{moneyCompact(pnl.expenseTotal)}</strong></div>
        <div><span>خالص نفع</span><strong style={{ color: pnl.net.gte(0) ? "#7ff0c0" : "#ffb4b4" }}>{moneyCompact(pnl.net)}</strong></div>
      </div>

      <div className="pnl-layout">
        <Card>
          <div className="card-head"><div><h2>آمدنی گوشوارہ</h2><p>{fmtDate(from)} — {fmtDate(to)}</p></div></div>
          {pnl.revenue.lte(0) && pnl.expenseTotal.lte(0) ? <EmptyState icon="chart" title="اس مدت میں کوئی ڈیٹا نہیں" /> : (
            <>
              <div className="statement-row"><span>کل فروخت</span><strong>{money(pnl.revenue)}</strong><small>{pnl.salesCount} ریکارڈ</small></div>
              <div className="statement-row"><span>منہا: لاگتِ مال (COGS)</span><strong>−{money(pnl.cogs)}</strong></div>
              <div className="statement-row total"><span>مجموعی نفع</span><strong>{money(pnl.gross)}</strong></div>
              <div className="statement-row"><span>منہا: اخراجات</span><strong>−{money(pnl.expenseTotal)}</strong></div>
              <div className="statement-row total"><span>خالص نفع / نقصان</span><strong>{money(pnl.net)}</strong></div>
              <div className="definition"><strong>نفع = آمدنی − (لاگتِ مال + اخراجات)</strong><p>لاگتِ مال وزنی اوسط طریقے سے فی لیٹر شمار کی جاتی ہے اور ہر فروخت کے وقت محفوظ ہوتی ہے۔</p></div>
            </>
          )}
        </Card>

        <Card>
          <div className="card-head"><div><h2>ایندھن کے حساب سے منافع</h2><p>فی لیٹر مارجن</p></div></div>
          {fuelRows.map((f) => (
            <div className="fuel-profit" key={f.fuel}>
              <div><span className={`fuel-mark ${f.fuel}`} /></div>
              <div style={{ flex: 1 }}>
                <span>{f.fuel === "petrol" ? "پٹرول" : "ڈیزل"}</span>
                <strong>{money(f.gross)}</strong>
                <small>فروخت {qty(f.litres)} · فی لیٹر مارجن {money(f.margin)}</small>
              </div>
            </div>
          ))}
          <div className="review-block"><span>کل خریداری (اس مدت)</span><strong>{money(totalPurchase)}</strong></div>
        </Card>
      </div>
    </>
  );
}
