import { useMemo, useState } from "react";
import { useDepot } from "../lib/store";
import { Card, PageHeader, Button, Field, Badge, EmptyState, useToast } from "../components/ui";
import { Icon } from "../components/Icons";
import { D, money, qty, fmtDate, fmtDateTime, todayIso } from "../lib/format";
import { createRecord, byDateDesc } from "../lib/repo";
import { useAuth } from "../lib/auth";
import { useLang } from "../lib/lang";
import { exportCsv, printHtml, reportHeader } from "../lib/print";

export default function Closing() {
  const d = useDepot();
  const { user } = useAuth();
  const toast = useToast();
  const { t } = useLang();
  const [date, setDate] = useState(d.today || todayIso());
  const [actual, setActual] = useState("");
  const [busy, setBusy] = useState(false);

  const figures = useMemo(() => {
    const rows = d.cashbook.filter((c) => String(c.business_date ?? "").slice(0, 10) === date);
    const isCash = (r: Record<string, unknown>) => String(r.method) === "cash";
    const sum = (fn: (r: Record<string, unknown>) => boolean) => rows.filter(fn).reduce((a, r) => a.plus(D(r.amount as string)), D(0));
    const cashSales = sum((r) => String(r.dir) === "in" && String(r.category) === "sale" && isCash(r));
    const collections = sum((r) => String(r.dir) === "in" && String(r.category) === "customer_payment" && isCash(r));
    const otherIn = sum((r) => String(r.dir) === "in" && !["sale", "customer_payment"].includes(String(r.category)) && isCash(r));
    const supplierPayments = sum((r) => String(r.dir) === "out" && String(r.category) === "supplier_payment" && isCash(r));
    const expenseOut = sum((r) => String(r.dir) === "out" && String(r.category) === "expense" && isCash(r));
    const otherOut = sum((r) => String(r.dir) === "out" && !["supplier_payment", "expense"].includes(String(r.category)) && isCash(r));
    const opening = (() => {
      const prior = d.dailyClosings.filter((c) => String(c.business_date) < date).sort((a, b) => String(b.business_date).localeCompare(String(a.business_date)))[0];
      return D((prior?.actual_cash as string) ?? "0");
    })();
    const expected = opening.plus(cashSales).plus(collections).plus(otherIn).minus(supplierPayments).minus(expenseOut).minus(otherOut);
    const petrol = d.stocks.filter((s) => s.fuel === "petrol").reduce((a, s) => a.plus(s.book), D(0));
    const diesel = d.stocks.filter((s) => s.fuel === "diesel").reduce((a, s) => a.plus(s.book), D(0));
    const salesOnDate = d.sales.filter((s) => String(s.business_date) === date && String(s.status) !== "reversed");
    return { cashSales, collections, otherIn, supplierPayments, expenseOut, otherOut, expected: D(0).plus(cashSales).plus(collections).plus(otherIn).minus(supplierPayments).minus(expenseOut).minus(otherOut), petrol, diesel, salesOnDate };
  }, [d.dailyClosings, d.cashbook, d.sales, d.tankDips, date]);

  const existing = d.dailyClosings.find((c) => String(c.business_date) === date);
  const difference = D(actual).minus(figures.expected);

  async function save() {
    if (!actual) { toast("اصل نقد درج کریں", "danger"); return; }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      await createRecord("daily_closings", {
        business_date: date, opened_at: existing ? String(existing.opened_at) : now, closed_at: now,
        operator_id: user?.uid ?? "web", opening_cash: "0",
        cash_sales: figures.cashSales.toFixed(2), customer_collections: figures.collections.toFixed(2),
        supplier_payments: figures.supplierPayments.toFixed(2), expenses: figures.expenseOut.toFixed(2),
        other_in: figures.otherIn.toFixed(2), other_out: figures.otherOut.toFixed(2),
        expected_cash: figures.expected.toFixed(2), actual_cash: D(actual).toFixed(2),
        difference: difference.toFixed(2), petrol_stock: figures.petrol.toFixed(3), diesel_stock: figures.diesel.toFixed(3),
        pending_count: 0,
      }, { createdBy: user?.uid });
      toast("دن بند کر دیا گیا"); setActual("");
    } catch (e) { toast((e as Error).message, "danger"); } finally { setBusy(false); }
  }

  function printClose() {
    const depot = { name: d.settings.depot_name || "پٹرولیم ڈپو", contact: d.settings.depot_contact, address: d.settings.depot_address };
    printHtml("روزانہ کلوزنگ", `${reportHeader(depot, "روزانہ کلوزنگ", fmtDate(date))}
      <table>
        <tr><th>نقد فروخت</th><td class="latin">${money(figures.cashSales)}</td></tr>
        <tr><th>گاہک وصولیاں</th><td class="latin">${money(figures.collections)}</td></tr>
        <tr><th>دیگر آمد</th><td class="latin">${money(figures.otherIn)}</td></tr>
        <tr><th>سپلائر ادائیگیاں</th><td class="latin">−${money(figures.supplierPayments)}</td></tr>
        <tr><th>اخراجات</th><td class="latin">−${money(figures.expenseOut)}</td></tr>
        <tr><th>دیگر اخراج</th><td class="latin">−${money(figures.otherOut)}</td></tr>
        <tr class="total"><th>متوقع نقد</th><td class="latin">${money(figures.expected)}</td></tr>
      </table>`);
  }

  return (
    <>
      <PageHeader eyebrow={t.all} title={t.closingTitle} description={t.closingDesc}>
        <input className="date-control latin" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Button variant="secondary" icon="print" onClick={printClose}>پرنٹ</Button>
        <Button variant="secondary" icon="download" onClick={() => exportCsv("closings", [
          { header: "Date", value: (c) => String(c.business_date) }, { header: "Expected", value: (c) => String(c.expected_cash) },
          { header: "Actual", value: (c) => String(c.actual_cash) }, { header: "Diff", value: (c) => String(c.difference) },
        ], byDateDesc(d.dailyClosings, "business_date"))}>CSV</Button>
      </PageHeader>

      {existing && <div className="notice"><Icon name="check" /><div><strong>یہ دن بند ہو چکا ہے</strong><span>بندش {fmtDateTime(String(existing.closed_at))} پر کی گئی · فرق {money(existing.difference as string)}</span></div></div>}

      <div className="dashboard-grid">
        <Card>
          <div className="card-head"><div><h2>نقد تصدیق</h2><p>{fmtDate(date)} · بزنس ڈے</p></div></div>
          <div className="statement-row"><span>نقد فروخت</span><strong>{money(figures.cashSales)}</strong></div>
          <div className="statement-row"><span>گاہک وصولیاں</span><strong>{money(figures.collections)}</strong></div>
          <div className="statement-row"><span>دیگر آمد</span><strong>{money(figures.otherIn)}</strong></div>
          <div className="statement-row"><span>سپلائر ادائیگیاں</span><strong>−{money(figures.supplierPayments)}</strong></div>
          <div className="statement-row"><span>اخراجات</span><strong>−{money(figures.expenseOut)}</strong></div>
          <div className="statement-row"><span>دیگر اخراج</span><strong>−{money(figures.otherOut)}</strong></div>
          <div className="statement-row total"><span>متوقع نقد</span><strong>{money(figures.expected)}</strong></div>
        </Card>

        <Card>
          <div className="card-head"><div><h2>اصل نقد</h2><p>گلے میں موجود رقم درج کریں</p></div></div>
          <div style={{ padding: "0 3px 8px" }}>
            <Field label="اصل نقد"><input className="latin" inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} /></Field>
          </div>
          <div className="reconcile-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div><span>متوقع</span><strong>{money(figures.expected)}</strong></div>
            <div><span>فرق</span><strong className={difference.lt(0) || difference.gt(0) ? "danger-text" : ""}>{actual ? money(difference) : "—"}</strong></div>
          </div>
          {actual && !difference.eq(0) && <div className="notice warning" style={{ marginTop: 12 }}><Icon name="alert" /><div><strong>عدم مطابقت</strong><span>فرق {money(difference)} — سبب درج کریں۔</span></div></div>}
          <div className="card-actions">
            <Button variant="primary" icon="check" disabled={busy || !actual} onClick={save}>{existing ? "کلوزنگ اپ ڈیٹ" : "دن بند کریں"}</Button>
          </div>
        </Card>

        <Card>
          <div className="card-head"><div><h2>اسٹاک پوزیشن</h2><p>بندش کے وقت</p></div></div>
          <div className="tank-line"><div className="tank-name"><span className="fuel-mark petrol" /><div><strong>پٹرول</strong></div></div><div className="tank-amount"><strong>{qty(figures.petrol)}</strong></div></div>
          <div className="tank-line"><div className="tank-name"><span className="fuel-mark diesel" /><div><strong>ڈیزل</strong></div></div><div className="tank-amount"><strong>{qty(figures.diesel)}</strong></div></div>
          <div className="review-block" style={{ marginTop: 14 }}><span>آج کی فروخت</span><strong>{figures.salesOnDate.length} ریکارڈ</strong><small>{money(figures.salesOnDate.reduce((a, s) => a.plus(D(s.total_amount as string)), D(0)))}</small></div>
        </Card>
      </div>

      <Card>
        <div className="card-head"><div><h2>کلوزنگ ہسٹری</h2><p>گزشتہ بندشات</p></div></div>
        {d.dailyClosings.length === 0 ? <EmptyState icon="check" title="کوئی کلوزنگ نہیں" /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>تاریخ</th><th>متوقع</th><th>اصل</th><th>فرق</th><th>پٹرول</th><th>ڈیزل</th><th>بندش وقت</th></tr></thead>
            <tbody>
              {byDateDesc(d.dailyClosings, "business_date").map((c) => (
                <tr key={String(c.id)}>
                  <td>{fmtDate(String(c.business_date))}</td>
                  <td className="num">{money(c.expected_cash as string)}</td>
                  <td className="num">{money(c.actual_cash as string)}</td>
                  <td className="num">{D(c.difference as string).eq(0) ? <Badge tone="success">مطابق</Badge> : <span className="danger-text">{money(c.difference as string)}</span>}</td>
                  <td className="num">{qty(c.petrol_stock as string)}</td>
                  <td className="num">{qty(c.diesel_stock as string)}</td>
                  <td>{fmtDateTime(String(c.closed_at))}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}
