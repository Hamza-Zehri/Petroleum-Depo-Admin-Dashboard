import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useDepot } from "../lib/store";
import { useLang } from "../lib/lang";
import { Card, Metric, Progress, Badge, StatusBadge, PageHeader, Button, LoadingState, EmptyState } from "../components/ui";
import { Icon } from "../components/Icons";
import { money, moneyShort, qty, fmtDate, D, percent, clampPct } from "../lib/format";
import { byDateDesc } from "../lib/repo";

export default function Dashboard() {
  const d = useDepot();
  const nav = useNavigate();
  const { t } = useLang();

  const receivable = useMemo(
    () => d.customerBalances.reduce((a, b) => a.plus(b.due.gt(0) ? b.due : 0), D(0)),
    [d.customerBalances],
  );
  const payable = useMemo(
    () => d.supplierBalances.reduce((a, b) => a.plus(b.due.gt(0) ? b.due : 0), D(0)),
    [d.supplierBalances],
  );

  const trend = useMemo(() => {
    const days: { date: string; total: import("decimal.js").default }[] = [];
    const map = new Map<string, ReturnType<typeof D>>();
    for (const s of d.sales) {
      const bd = String((s as Record<string, unknown>).business_date ?? "");
      if (!bd) continue;
      map.set(bd, (map.get(bd) ?? D(0)).plus(D((s as Record<string, unknown>).total_amount as string)));
    }
    const keys = [...map.keys()].sort().slice(-7);
    for (const k of keys) days.push({ date: k, total: map.get(k)! });
    return days;
  }, [d.sales]);
  const trendMax = trend.reduce((m, t) => Math.max(m, t.total.toNumber()), 0) || 1;

  const movements = useMemo(() => byDateDesc(d.stockLedger, "entry_time").slice(0, 6), [d.stockLedger]);

  const lowTanks = d.stocks.filter((s) => {
    const cap = d.tanks.find((t) => String(t.id) === s.tankId);
    const c = D((cap?.capacity as string) ?? "0");
    return c.gt(0) && s.book.div(c).lt(0.18);
  });

  const overdue = d.customerBalances.filter((b) => b.due.gt(0)).sort((a, b) => b.due.comparedTo(a.due)).slice(0, 4);

  if (d.loading) return <LoadingState />;
  if (d.errors.length) return <div className="notice warning"><Icon name="alert" /><div><strong>{t.firestoreConnection}</strong><span>{d.errors[0]}</span></div></div>;

  const todaySales = d.sales.filter((s) => String(s.business_date) === d.today)
    .reduce((a, s) => a.plus(D(s.total_amount as string)), D(0));
  const todaySalesCount = d.sales.filter((s) => String(s.business_date) === d.today).length;

  return (
    <>
      <PageHeader eyebrow={t.all} title={t.dashboardTitle} description={t.dashboardDesc}>
        <Button variant="secondary" icon="print" onClick={() => nav("/reports")}>{t.report}</Button>
        <Button variant="primary" icon="plus" onClick={() => nav("/sales")}>{t.newSale}</Button>
      </PageHeader>

      <div className="metrics-grid">
        <Metric label={t.cashInHand} value={moneyShort(d.cashInHand)} meta={t.cashInHand + " · " + "cash"} tone="success" icon="wallet" onClick={() => nav("/cashbook")} />
        <Metric label={t.bankBalance} value={moneyShort(d.bankBalance)} meta={t.bankBalance} tone="info" icon="wallet" onClick={() => nav("/cashbook")} />
        <Metric label={t.receivable} value={moneyShort(receivable)} meta={`${d.customerBalances.filter((b) => b.due.gt(0)).length} ${t.customersTitle}`.toLowerCase()} tone="warning" icon="users" onClick={() => nav("/customers")} />
        <Metric label={t.payable} value={moneyShort(payable)} meta={`${d.supplierBalances.filter((b) => b.due.gt(0)).length} ${t.suppliersTitle}`.toLowerCase()} tone="danger" icon="box" onClick={() => nav("/suppliers")} />
        <Metric label={t.petrolStock} value={qty(d.petrolStock)} meta={`${t.capacity} ${qty(d.petrolCapacity)}`} tone="success" icon="tank" onClick={() => nav("/stock")} />
        <Metric label={t.dieselStock} value={qty(d.dieselStock)} meta={`${t.capacity} ${qty(d.dieselCapacity)}`} tone="info" icon="tank" onClick={() => nav("/stock")} />
      </div>

      <div className="dashboard-grid">
        <Card>
          <div className="card-head">
            <div><h2>{t.tankStock}</h2><p>{t.currentBookStockCapacity}</p></div>
            <Button variant="ghost" icon="chevron" onClick={() => nav("/stock")}>{t.viewAll}</Button>
          </div>
          {d.stocks.length === 0 && <EmptyState icon="tank" title={t.noTanks} hint={t.addTankHint} />}
          {d.stocks.map((s) => {
            const cap = D((d.tanks.find((t) => String(t.id) === s.tankId)?.capacity as string) ?? "0");
            const pct = clampPct(percent(s.book, cap));
            const tone = pct < 18 ? "danger" : pct < 40 ? "warning" : "success";
            return (
              <div key={s.tankId}>
                <div className="tank-line">
                  <div className="tank-name">
                    <span className={`fuel-mark ${s.fuel}`} />
                    <div><strong>{s.name}</strong><small>{s.fuel === "petrol" ? t.petrol : t.diesel} · {qty(cap)}</small></div>
                  </div>
                  <div className="tank-amount"><strong>{qty(s.book)}</strong><small>{t.available}</small></div>
                </div>
                <Progress value={pct} tone={tone} label={s.name} />
              </div>
            );
          })}
        </Card>

        <Card>
          <div className="card-head">
            <div><h2>{t.todaySales}</h2><p>{t.businessDay} {fmtDate(d.today)}</p></div>
            <Badge tone="success">{t.live}</Badge>
          </div>
          <div className="tank-stock">
            <span>{t.totalSales}</span>
            <strong>{money(todaySales)}</strong>
            <small>{todaySalesCount} {t.transactions}</small>
          </div>
          <div className="mini-chart">
            {trend.length === 0 && <span style={{ height: "8%" }} />}
            {trend.map((t) => (
              <span key={t.date} title={`${fmtDate(t.date)} · ${money(t.total)}`}
                style={{ height: `${Math.max(6, (t.total.toNumber() / trendMax) * 100)}%` }} />
            ))}
          </div>
          <div className="chart-labels">
            <span>{trend[0] ? fmtDate(trend[0].date) : "—"}</span>
            <span>{t.last7Days}</span>
            <span>{trend.length ? fmtDate(trend[trend.length - 1].date) : "—"}</span>
          </div>
          <div className="stock-foot"><span>{t.monthlyAvgPerDay}</span><strong>{moneyShort(trend.reduce((a, t) => a.plus(t.total), D(0)).div(Math.max(trend.length, 1)))}</strong></div>
        </Card>

        <Card>
          <div className="card-head">
            <div><h2>{t.recentStockMovement}</h2><p>{t.latestBookEntries}</p></div>
            <Button variant="ghost" icon="chevron" onClick={() => nav("/stock")}>{t.ledger}</Button>
          </div>
          {movements.length === 0 && <EmptyState icon="sync" title={t.noRecords} />}
          {movements.map((m) => {
            const isIn = String(m.movement) === "in";
            const isAdjust = String(m.movement) === "adjust";
            return (
              <div className="movement-row" key={String(m.id)}>
                <span className={`movement-icon ${isIn ? "in" : "out"}`}><Icon name={isAdjust ? "settings" : isIn ? "download" : "fuel"} size={16} /></span>
                <div>
                  <strong>{isAdjust ? t.adjustment : isIn ? t.received : t.loadingWord} · {String(m.fuel_type) === "petrol" ? t.petrol : t.diesel}</strong>
                  <small>{fmtDate(String(m.business_date))}</small>
                </div>
                <strong className={isIn ? "" : ""}>{isIn ? "+" : isAdjust ? "±" : "−"}{qty(m.quantity as string)}</strong>
              </div>
            );
          })}
        </Card>
      </div>

      <div className="dashboard-grid">
        <Card>
          <div className="card-head"><div><h2>{t.notesAlerts}</h2><p>{t.itemsNeedingAttention}</p></div></div>
          {lowTanks.length === 0 && <p className="insight"><Icon name="check" size={14} /> {t.allTanksAdequate}</p>}
          {lowTanks.map((s) => (
            <div className="notice warning" key={s.tankId} style={{ marginBottom: 8 }}>
              <Icon name="alert" /><div><strong>{s.name} {t.lowLevel}</strong><span>{t.available} {qty(s.book)} — {t.needsRefill}</span></div>
            </div>
          ))}
        </Card>

        <Card>
          <div className="card-head">
            <div><h2>{t.receivablesList}</h2><p>{t.highDueCustomers}</p></div>
            <Button variant="ghost" icon="chevron" onClick={() => nav("/customers")}>{t.allWord}</Button>
          </div>
          {overdue.length === 0 && <p className="insight"><Icon name="check" size={14} /> {t.noDues}</p>}
          <table>
            <tbody>
              {overdue.map((b) => {
                const c = d.customers.find((x) => String(x.id) === b.customerId);
                return (
                  <tr key={b.customerId}>
                    <td><strong>{String(c?.name ?? "—")}</strong></td>
                    <td className="num">{money(b.due)}</td>
                    <td><Button variant="ghost" icon="plus" onClick={() => nav("/customers")}>{t.receivePayment}</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card>
          <div className="card-head"><div><h2>{t.recentTransactions}</h2><p>{t.purchasesAndSales}</p></div></div>
          <table>
            <tbody>
              {([...byDateDesc(d.sales, "created_at").slice(0, 4).map((s) => ({ ...s, kind: "sale" })),
              ...byDateDesc(d.purchases, "created_at").slice(0, 3).map((p) => ({ ...p, kind: "purchase" }))] as Record<string, unknown>[])
                .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
                .slice(0, 6)
                .map((r) => (
                  <tr key={String(r.id)}>
                    <td><StatusBadge status={r.kind === "sale" ? (String(r.payment_type)) : (String(r.payment_status))} /></td>
                    <td><strong>{String(r.ref_no)}</strong></td>
                    <td className="num">{money(r.total_amount as string)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
