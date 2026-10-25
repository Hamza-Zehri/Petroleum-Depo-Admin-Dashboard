import { useMemo, useState } from "react";
import { useDepot } from "../lib/store";
import { Card, Button, PageHeader, Modal, Field, Badge, Progress, EmptyState, StatusBadge, useToast } from "../components/ui";
import { Icon } from "../components/Icons";
import { D, qty, fmtDate, fmtDateTime, percent, clampPct, money } from "../lib/format";
import { createRecord, patchRecord, deleteRecord, byDateDesc } from "../lib/repo";
import { postTankDip, postStockAdjustment } from "../lib/posting";
import { useAuth } from "../lib/auth";
import { useLang } from "../lib/lang";
import { exportCsv } from "../lib/print";

type Tab = "tanks" | "ledger" | "dips" | "adjust";

interface TankForm { id?: string; name: string; fuel_type: string; capacity: string; opening_stock: string; active: boolean }
const emptyTank: TankForm = { name: "", fuel_type: "petrol", capacity: "", opening_stock: "0", active: true };

export default function Stock() {
  const d = useDepot();
  const { user } = useAuth();
  const toast = useToast();
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>("tanks");
  const [tankForm, setTankForm] = useState<TankForm | null>(null);
  const [dipFor, setDipFor] = useState<string | null>(null);
  const [adjustFor, setAdjustFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ledger = useMemo(() => byDateDesc(d.stockLedger, "entry_time"), [d.stockLedger]);
  const capOf = (id: string) => D((d.tanks.find((t) => String(t.id) === id)?.capacity as string) ?? "0");
  const nameOf = (id: string) => String(d.tanks.find((t) => String(t.id) === id)?.name ?? "—");

  async function saveTank(f: TankForm) {
    setBusy(true);
    try {
      const payload = {
        name: f.name.trim(), fuel_type: f.fuel_type, capacity: D(f.capacity).toFixed(3),
        opening_stock: D(f.opening_stock).toFixed(3), active: f.active, created_by: user?.uid ?? "web",
      };
      if (f.id) await patchRecord("tanks", f.id, payload);
      else await createRecord("tanks", payload, { createdBy: user?.uid });
      toast(f.id ? t.tankUpdated : t.tankAdded);
      setTankForm(null);
    } catch (e) { toast((e as Error).message, "danger"); }
    finally { setBusy(false); }
  }

  async function removeTank(id: string) {
    if (!confirm(t.deleteTankConfirm)) return;
    try { await deleteRecord("tanks", id); toast(t.tankDeleted); }
    catch (e) { toast((e as Error).message, "danger"); }
  }

  return (
    <>
      <PageHeader eyebrow={t.all} title={t.stockTitle} description={t.stockDesc}>
        <Button variant="secondary" icon="download" onClick={() => exportCsv("stock-ledger", [
          { header: t.date, value: (r) => String(r.business_date) },
          { header: t.tank, value: (r) => nameOf(String(r.tank_id)) },
          { header: t.fuel, value: (r) => String(r.fuel_type) === "petrol" ? t.petrol : t.diesel },
          { header: t.movement, value: (r) => String(r.movement) === "in" ? t.inMovement : String(r.movement) === "adjust" ? t.adjustMovement : t.outMovement },
          { header: t.quantity, value: (r) => String(r.quantity) },
          { header: t.ref, value: (r) => String(r.ref_type) },
        ], ledger)}>CSV</Button>
        <Button variant="primary" icon="plus" onClick={() => setTankForm({ ...emptyTank })}>{t.newTank}</Button>
      </PageHeader>

      <div className="section-tabs">
        {([["tanks", t.tanksTab], ["ledger", t.stockLedgerTab], ["dips", t.dipsTab], ["adjust", t.adjustTab]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === "tanks" && (
        <div className="tank-grid">
          {d.stocks.length === 0 && <Card><EmptyState icon="tank" title={t.noTank} hint={t.addTankViaNew} /></Card>}
          {d.stocks.map((s) => {
            const tank = d.tanks.find((t) => String(t.id) === s.tankId);
            const cap = capOf(s.tankId);
            const pct = clampPct(percent(s.book, cap));
            const tone = pct < 18 ? "danger" : pct < 40 ? "warning" : "success";
            return (
              <Card className="tank-card" key={s.tankId}>
                <div className="card-head">
                  <div className="tank-title">
                    <span className={`fuel-mark ${s.fuel}`} />
                    <div><h2>{s.name}</h2><p>{s.fuel === "petrol" ? t.petrol : t.diesel} · {String(tank?.active) === "false" ? t.inactiveStatus : t.active}</p></div>
                  </div>
                  <Badge tone={tone}>{pct}%</Badge>
                </div>
                <div className="tank-stock">
                  <span>{t.currentBookStock}</span>
                  <strong>{qty(s.book)}</strong>
                  <small>{t.capacity} {qty(cap)} · {t.empty} {qty(cap.minus(s.book))}</small>
                </div>
                <Progress value={pct} tone={tone} label={s.name} />
                <dl className="tank-facts">
                  <div><dt>{t.received}</dt><dd>{qty(s.received)}</dd></div>
                  <div><dt>{t.loadingWord}</dt><dd>{qty(s.dispatched)}</dd></div>
                  <div><dt>{t.adjust}</dt><dd>{qty(s.adjusted)}</dd></div>
                  <div><dt>{t.dip}</dt><dd>{latestDip(d.tankDips, s.tankId)}</dd></div>
                </dl>
                <div className="card-actions">
                  <Button icon="check" onClick={() => setDipFor(s.tankId)}>{t.dip}</Button>
                  <Button icon="settings" onClick={() => setAdjustFor(s.tankId)}>{t.adjust}</Button>
                  <Button icon="file" onClick={() => setTankForm({ id: s.tankId, name: s.name, fuel_type: s.fuel, capacity: cap.toFixed(3), opening_stock: D(tank?.opening_stock as string).toFixed(3), active: tank?.active !== false })}>{t.edit}</Button>
                  <Button variant="ghost" icon="alert" onClick={() => removeTank(s.tankId)}>{t.delete}</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "ledger" && (
        <Card>
          <div className="card-head"><div><h2>{t.stockLedgerTitle}</h2><p>{t.allEntriesAppendOnly}</p></div></div>
          {ledger.length === 0 ? <EmptyState icon="sync" title={t.noEntry} /> : (
            <div className="table-scroll"><table>
              <thead><tr><th>{t.time}</th><th>{t.tank}</th><th>{t.fuel}</th><th>{t.movement}</th><th>{t.qtyLabel}</th><th>{t.ref}</th></tr></thead>
              <tbody>
                {ledger.slice(0, 200).map((l) => (
                  <tr key={String(l.id)}>
                    <td>{fmtDateTime(String(l.entry_time))}</td>
                    <td>{nameOf(String(l.tank_id))}</td>
                    <td>{String(l.fuel_type) === "petrol" ? t.petrol : t.diesel}</td>
                    <td><Badge tone={String(l.movement) === "in" ? "success" : String(l.movement) === "adjust" ? "warning" : "info"}>{String(l.movement) === "in" ? t.inMovement : String(l.movement) === "adjust" ? t.adjustMovement : t.outMovement}</Badge></td>
                    <td className="num">{qty(l.quantity as string)}</td>
                    <td>{String(l.ref_type)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Card>
      )}

      {tab === "dips" && (
        <Card>
          <div className="card-head"><div><h2>{t.tankDipsTitle}</h2><p>{t.measurementVsBook}</p></div></div>
          {d.tankDips.length === 0 ? <EmptyState icon="tank" title={t.noDip} /> : (
            <div className="table-scroll"><table>
              <thead><tr><th>{t.time}</th><th>{t.tank}</th><th>{t.measured}</th><th>{t.book}</th><th>{t.variance}</th><th>{t.note}</th></tr></thead>
              <tbody>
                {byDateDesc(d.tankDips, "measured_at").map((r) => {
                  const v = D(r.variance as string);
                  return (
                    <tr key={String(r.id)}>
                      <td>{fmtDateTime(String(r.measured_at))}</td>
                      <td>{nameOf(String(r.tank_id))}</td>
                      <td className="num">{qty(r.measured_qty as string)}</td>
                      <td className="num">{qty(r.book_qty as string)}</td>
                      <td className={`num ${v.lt(0) ? "danger-text" : ""}`}>{qty(r.variance as string)}</td>
                      <td>{String(r.notes ?? "—")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </Card>
      )}

      {tab === "adjust" && (
        <Card>
          <div className="card-head"><div><h2>{t.stockAdjustmentTitle}</h2><p>{t.approvedBookCorrections}</p></div></div>
          {d.stockLedger.filter((l) => String(l.ref_type) === "adjustment").length === 0 ? <EmptyState icon="settings" title={t.noAdjustment} /> : (
            <div className="table-scroll"><table>
              <thead><tr><th>{t.time}</th><th>{t.tank}</th><th>{t.qtyLabel}</th><th>{t.reason}</th></tr></thead>
              <tbody>
                {byDateDesc(d.stockLedger.filter((l) => String(l.ref_type) === "adjustment"), "entry_time").map((l) => (
                  <tr key={String(l.id)}>
                    <td>{fmtDateTime(String(l.entry_time))}</td>
                    <td>{nameOf(String(l.tank_id))}</td>
                    <td className="num">{qty(l.quantity as string)}</td>
                    <td>{String(l.notes ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Card>
      )}

      {tankForm && (
        <Modal title={tankForm.id ? t.editTank : t.newTank} onClose={() => setTankForm(null)}
          footer={<>
            <Button onClick={() => setTankForm(null)}>{t.cancel}</Button>
            <Button variant="primary" disabled={busy || !tankForm.name || !tankForm.capacity} onClick={() => saveTank(tankForm)}>{t.save}</Button>
          </>}>
          <div className="form-grid">
            <Field label={t.name}><input value={tankForm.name} onChange={(e) => setTankForm({ ...tankForm, name: e.target.value })} /></Field>
            <Field label={t.fuel}>
              <select value={tankForm.fuel_type} onChange={(e) => setTankForm({ ...tankForm, fuel_type: e.target.value })}>
                <option value="petrol">{t.petrol}</option><option value="diesel">{t.diesel}</option>
              </select>
            </Field>
            <Field label={t.capacityLiters}><input className="latin" inputMode="decimal" value={tankForm.capacity} onChange={(e) => setTankForm({ ...tankForm, capacity: e.target.value })} /></Field>
            <Field label={t.openingStock}><input className="latin" inputMode="decimal" value={tankForm.opening_stock} onChange={(e) => setTankForm({ ...tankForm, opening_stock: e.target.value })} /></Field>
            <Field label={t.active}>
              <select value={String(tankForm.active)} onChange={(e) => setTankForm({ ...tankForm, active: e.target.value === "true" })}>
                <option value="true">{t.yes}</option><option value="false">{t.no}</option>
              </select>
            </Field>
          </div>
        </Modal>
      )}

      {dipFor && <DipModal tankId={dipFor} book={d.stocks.find((s) => s.tankId === dipFor)?.book.toFixed(3) ?? "0"} onClose={() => setDipFor(null)} />}
      {adjustFor && <AdjustModal tankId={adjustFor} fuel={String(d.tanks.find((t) => String(t.id) === adjustFor)?.fuel_type ?? "petrol")} onClose={() => setAdjustFor(null)} />}
    </>
  );
}

function latestDip(dips: Record<string, unknown>[], tankId: string): string {
  const rows = dips.filter((x) => String(x.tank_id) === tankId).sort((a, b) => String(b.measured_at).localeCompare(String(a.measured_at)));
  if (!rows.length) return "—";
  return `${qty(rows[0].measured_qty as string)} · ${fmtDate(String(rows[0].measured_at))}`;
}

function DipModal({ tankId, book, onClose }: { tankId: string; book: string; onClose: () => void }) {
  const { user } = useAuth();
  const { t } = useLang();
  const toast = useToast();
  const [measured, setMeasured] = useState(book);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const variance = D(measured).minus(D(book));
  return (
    <Modal title={t.recordTankDip} onClose={onClose} footer={<>
      <Button onClick={onClose}>{t.cancel}</Button>
      <Button variant="primary" disabled={busy} onClick={async () => {
        setBusy(true);
        try { await postTankDip({ tank_id: tankId, measured_qty: measured, book_qty: book, notes, actor: user?.uid ?? "web" }); toast(t.dipSaved); onClose(); }
        catch (e) { toast((e as Error).message, "danger"); } finally { setBusy(false); }
      }}>{t.save}</Button>
    </>}>
      <div className="review-block"><span>{t.bookStock}</span><strong>{qty(book)}</strong></div>
      <div className="form-grid">
        <Field label={t.measuredQtyLiters}><input className="latin" inputMode="decimal" value={measured} onChange={(e) => setMeasured(e.target.value)} /></Field>
        <Field label={t.variance}>
          <input className="latin" readOnly value={variance.toFixed(3)} style={{ color: variance.lt(0) ? "var(--red-700)" : "var(--green-700)" }} />
        </Field>
        <Field label={t.note} full><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function AdjustModal({ tankId, fuel, onClose }: { tankId: string; fuel: string; onClose: () => void }) {
  const { user } = useAuth();
  const { t } = useLang();
  const toast = useToast();
  const [qtyVal, setQtyVal] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={t.stockAdjustmentModal} onClose={onClose} footer={<>
      <Button onClick={onClose}>{t.cancel}</Button>
      <Button variant="danger" disabled={busy || !reason} onClick={async () => {
        setBusy(true);
        try {
          await postStockAdjustment({ tank_id: tankId, fuel_type: fuel, adjustment_qty: qtyVal, reason, actor: user?.uid ?? "web" });
          await createRecord("audit_logs", { action: "stock_adjust", entity: "stock_adjustments", entity_id: tankId, after_json: JSON.stringify({ adjustment_qty: qtyVal, reason }), business_date: new Date().toISOString().slice(0, 10), user_id: user?.uid ?? "web", event_time: new Date().toISOString() });
          toast(t.dipSaved); onClose();
        } catch (e) { toast((e as Error).message, "danger"); } finally { setBusy(false); }
      }}>{t.confirmAndPost}</Button>
    </>}>
      <div className="notice warning"><Icon name="alert" /><div><strong>{t.lowLevel}</strong><span>{t.needsRefill}</span></div></div>
      <div className="form-grid">
        <Field label={t.measuredQtyLiters}>
                <input className="latin" inputMode="decimal" value={qtyVal} onChange={(e) => setQtyVal(e.target.value)} placeholder={t.measuredQtyLiters} /></Field>
        <Field label={t.reason}><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
