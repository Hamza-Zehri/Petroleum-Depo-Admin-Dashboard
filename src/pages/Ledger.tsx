import { useMemo, useState } from "react";
import { Card, Button, PageHeader, Modal, EmptyState, Badge } from "../components/ui";
import { Icon } from "../components/Icons";
import { useDepot } from "../lib/store";
import { useLang } from "../lib/lang";
import { D, money, fmtDate } from "../lib/format";
import { exportCsv } from "../lib/print";
import type Decimal from "decimal.js";

type Tab = "customers" | "suppliers";

interface StatementEntry {
  date: string;
  ref: string;
  label: string;
  debit: Decimal;
  credit: Decimal;
  running: Decimal;
}

interface AccountRow {
  id: string;
  name: string;
  contact: string;
  active: boolean;
  opening: Decimal;
  total: Decimal;
  paid: Decimal;
  due: Decimal;
}

/**
 * Account Ledger — one searchable place for every customer and supplier
 * balance, with a full transaction statement and a running balance. This is the
 * admin counterpart of the phone's customer/supplier detail screens.
 */
export default function Ledger() {
  const d = useDepot();
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>("customers");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<AccountRow | null>(null);

  const customerRows = useMemo<AccountRow[]>(
    () =>
      d.customers.map((c) => {
        const b = d.customerBalances.find((x) => x.customerId === String(c.id));
        return {
          id: String(c.id),
          name: String(c.name ?? ""),
          contact: String(c.contact ?? ""),
          active: c.active !== false,
          opening: b?.opening ?? D(0),
          total: b?.invoiced ?? D(0),
          paid: b?.paid ?? D(0),
          due: b?.due ?? D(0),
        };
      }),
    [d.customers, d.customerBalances],
  );

  const supplierRows = useMemo<AccountRow[]>(
    () =>
      d.suppliers.map((s) => {
        const b = d.supplierBalances.find((x) => x.supplierId === String(s.id));
        return {
          id: String(s.id),
          name: String(s.name ?? ""),
          contact: String(s.contact ?? ""),
          active: s.active !== false,
          opening: b?.opening ?? D(0),
          total: b?.purchases ?? D(0),
          paid: b?.paid ?? D(0),
          due: b?.due ?? D(0),
        };
      }),
    [d.suppliers, d.supplierBalances],
  );

  const rows = useMemo(() => {
    const all = tab === "customers" ? customerRows : supplierRows;
    const needle = q.trim().toLowerCase();
    return all
      .filter(
        (r) =>
          !needle ||
          r.name.toLowerCase().includes(needle) ||
          r.contact.toLowerCase().includes(needle),
      )
      .sort((a, b) => Math.abs(b.due.toNumber()) - Math.abs(a.due.toNumber()));
  }, [tab, q, customerRows, supplierRows]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          opening: acc.opening.plus(r.opening),
          total: acc.total.plus(r.total),
          paid: acc.paid.plus(r.paid),
          due: acc.due.plus(r.due),
        }),
        { opening: D(0), total: D(0), paid: D(0), due: D(0) },
      ),
    [rows],
  );

  const entriesFor = (account: AccountRow): StatementEntry[] => {
    const out: StatementEntry[] = [];
    let running = account.opening;
    out.push({
      date: "",
      ref: "—",
      label: t.openingBalance,
      debit: tab === "customers" ? account.opening : D(0),
      credit: tab === "suppliers" ? account.opening : D(0),
      running,
    });
    if (tab === "customers") {
      const sales = d.sales
        .filter((s) => String(s.customer_id) === account.id && String(s.status ?? "posted") !== "reversed")
        .map((s) => ({
          date: String(s.business_date ?? s.created_at ?? ""),
          ref: String(s.ref_no ?? s.id),
          label: `${t.salesTitle} · ${String(s.fuel_type ?? "")}`,
          amount: D(s.due_amount as string),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      for (const s of sales) {
        running = running.plus(s.amount);
        out.push({ date: s.date, ref: s.ref, label: s.label, debit: s.amount, credit: D(0), running });
      }
      const payments = d.customerPayments
        .filter((p) => String(p.customer_id) === account.id && String(p.status ?? "posted") !== "reversed")
        .map((p) => ({
          date: String(p.business_date ?? p.created_at ?? ""),
          ref: String(p.ref_no ?? p.id),
          label: `${t.receivePayment} · ${String(p.method ?? "")}`,
          amount: D(p.amount as string),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      for (const p of payments) {
        running = running.minus(p.amount);
        out.push({ date: p.date, ref: p.ref, label: p.label, debit: D(0), credit: p.amount, running });
      }
    } else {
      const purchases = d.purchases
        .filter((p) => String(p.supplier_id) === account.id && String(p.status ?? "posted") !== "reversed")
        .map((p) => ({
          date: String(p.business_date ?? p.created_at ?? ""),
          ref: String(p.ref_no ?? p.id),
          label: `${t.purchasesTitle} · ${String(p.fuel_type ?? "")}`,
          amount: D(p.total_amount as string),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      for (const p of purchases) {
        running = running.plus(p.amount);
        out.push({ date: p.date, ref: p.ref, label: p.label, debit: D(0), credit: p.amount, running });
      }
      const payments = d.supplierPayments
        .filter((p) => String(p.supplier_id) === account.id && String(p.status ?? "posted") !== "reversed")
        .map((p) => ({
          date: String(p.business_date ?? p.created_at ?? ""),
          ref: String(p.ref_no ?? p.id),
          label: `${t.payable} · ${String(p.method ?? "")}`,
          amount: D(p.amount as string),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      for (const p of payments) {
        running = running.minus(p.amount);
        out.push({ date: p.date, ref: p.ref, label: p.label, debit: p.amount, credit: D(0), running });
      }
    }
    return out;
  };

  const exportRows = () =>
    exportCsv(
      `${tab}-ledger.csv`,
      [
        { header: "Name", value: (r: AccountRow) => r.name },
        { header: "Phone", value: (r: AccountRow) => r.contact },
        { header: "Opening", value: (r: AccountRow) => r.opening.toFixed(2) },
        { header: tab === "customers" ? "Invoiced" : "Purchased", value: (r: AccountRow) => r.total.toFixed(2) },
        { header: "Paid", value: (r: AccountRow) => r.paid.toFixed(2) },
        { header: "Balance", value: (r: AccountRow) => r.due.toFixed(2) },
      ],
      rows,
    );

  return (
    <>
      <PageHeader eyebrow={t.all} title={t.ledgerTitle} description={t.ledgerDesc}>
        <Button variant="secondary" icon="download" onClick={exportRows}>{t.exportCsv}</Button>
      </PageHeader>

      <Card className="filter-card">
        <div className="filter-search">
          <Icon name="search" size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchAccounts} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant={tab === "customers" ? "primary" : "secondary"} icon="users" onClick={() => setTab("customers")}>
            {t.ledgerCustomers} ({customerRows.length})
          </Button>
          <Button variant={tab === "suppliers" ? "primary" : "secondary"} icon="box" onClick={() => setTab("suppliers")}>
            {t.ledgerSuppliers} ({supplierRows.length})
          </Button>
        </div>
      </Card>

      <div className="op-metrics">
        <Card className="metric-card">
          <div className="metric-top"><span>{t.openingBalance}</span></div>
          <strong>{money(totals.opening)}</strong>
        </Card>
        <Card className="metric-card">
          <div className="metric-top"><span>{tab === "customers" ? t.totalInvoiced : t.totalPurchased}</span></div>
          <strong>{money(totals.total)}</strong>
        </Card>
        <Card className="metric-card">
          <div className="metric-top"><span>{t.totalPaid}</span></div>
          <strong>{money(totals.paid)}</strong>
        </Card>
        <Card className="metric-card">
          <div className="metric-top"><span>{t.balance}</span></div>
          <strong>{money(totals.due)}</strong>
        </Card>
      </div>

      <Card>
        <div className="card-head">
          <div>
            <h2>{tab === "customers" ? t.ledgerCustomers : t.ledgerSuppliers}</h2>
            <p>{rows.length} {t.showingEntries}</p>
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon="users" title={t.noRecords} hint={t.noRecordsHint} />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t.name}</th>
                  <th>{t.contact}</th>
                  <th>{t.openingBalance}</th>
                  <th>{tab === "customers" ? t.totalInvoiced : t.totalPurchased}</th>
                  <th>{t.totalPaid}</th>
                  <th>{t.balance}</th>
                  <th>{t.status.active}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <button className="record-link" onClick={() => setOpen(r)}>{r.name}</button>
                    </td>
                    <td className="latin">{r.contact || "—"}</td>
                    <td className="num">{money(r.opening)}</td>
                    <td className="num">{money(r.total)}</td>
                    <td className="num">{money(r.paid)}</td>
                    <td className={`num ${r.due.gt(0) ? "danger-text" : ""}`}>{money(r.due)}</td>
                    <td><Badge tone={r.active ? "success" : "danger"}>{r.active ? t.active : t.inactive}</Badge></td>
                    <td>
                      <div className="table-tools">
                        <button onClick={() => setOpen(r)} title={t.fullStatement}>
                          <Icon name="file" size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {open && (
        <StatementModal
          account={open}
          kind={tab}
          entries={entriesFor(open)}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function StatementModal({
  account,
  kind,
  entries,
  onClose,
}: {
  account: AccountRow;
  kind: Tab;
  entries: StatementEntry[];
  onClose: () => void;
}) {
  const { t } = useLang();
  return (
    <Modal
      title={`${kind === "customers" ? t.customerAccount : t.supplierAccount} — ${account.name}`}
      onClose={onClose}
      footer={<Button onClick={onClose}>{t.close}</Button>}
    >
      <div className="reconcile-grid">
        <div><span>{t.openingBalance}</span><strong>{money(account.opening)}</strong></div>
        <div><span>{kind === "customers" ? t.totalInvoiced : t.totalPurchased}</span><strong>{money(account.total)}</strong></div>
        <div><span>{t.totalPaid}</span><strong>{money(account.paid)}</strong></div>
        <div><span>{t.balance}</span><strong>{money(account.due)}</strong></div>
      </div>

      <h3 style={{ margin: "18px 0 8px" }}>{t.transactionHistory}</h3>
      <div className="table-scroll" style={{ maxHeight: 420 }}>
        <table>
          <thead>
            <tr>
              <th>{t.date}</th>
              <th>{t.ref}</th>
              <th>{t.description}</th>
              <th>{t.debit}</th>
              <th>{t.credit}</th>
              <th>{t.runningBalance}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={`${e.ref}-${i}`}>
                <td>{e.date ? fmtDate(e.date) : "—"}</td>
                <td className="latin">{e.ref}</td>
                <td>{e.label}</td>
                <td className="num">{e.debit.gt(0) ? money(e.debit) : "—"}</td>
                <td className="num">{e.credit.gt(0) ? money(e.credit) : "—"}</td>
                <td className="num">{money(e.running)}</td>
              </tr>
            ))}
            {entries.length === 1 && (
              <tr><td colSpan={6}>{t.noTransactions}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
