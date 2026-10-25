import { useMemo } from "react";
import { useDepot } from "../lib/store";
import { useLang } from "../lib/lang";
import { Card, Button, PageHeader, Badge, EmptyState, useToast } from "../components/ui";
import { Icon } from "../components/Icons";
import { fmtDateTime } from "../lib/format";
import { useCollection, byDateDesc, patchRecord, ADMIN_DEVICE_ID } from "../lib/repo";
import { useAuth } from "../lib/auth";

type Doc = Record<string, unknown>;

export default function Sync() {
  const d = useDepot();
  const { t } = useLang();
  const { user } = useAuth();
  const toast = useToast();
  const { data: devices } = useCollection<Doc>("devices", [], ["devices-all"]);

  const all = useMemo(() => [
    ...d.sales, ...d.purchases, ...d.customerPayments, ...d.supplierPayments,
    ...d.expenses, ...d.stockLedger, ...d.cashbook, ...d.tankDips, ...d.dailyClosings,
  ], [d.sales, d.purchases, d.customerPayments, d.supplierPayments, d.expenses, d.stockLedger, d.cashbook, d.tankDips, d.dailyClosings]);

  const counts = useMemo(() => {
    const c = { synced: 0, pending: 0, syncing: 0, failed: 0, conflict: 0 };
    for (const r of all) {
      const s = String(r.sync_status ?? "synced") as keyof typeof c;
      if (s in c) c[s]++; else c.synced++;
    }
    return c;
  }, [all]);

  const lastActivity = useMemo(() => {
    const ts = all.map((r) => String(r.updated_at ?? r.created_at ?? r.entry_time ?? "")).filter(Boolean).sort();
    return ts.length ? ts[ts.length - 1] : "";
  }, [all]);

  const conflicts = all.filter((r) => String(r.sync_status) === "conflict");

  const isActive = (dev: Doc) => dev.active !== false && dev.revoked !== true;

  async function toggleDevice(dev: Doc) {
    const id = String(dev.id);
    const next = !isActive(dev);
    try {
      await patchRecord("devices", id, {
        active: next,
        revoked: !next,
        revoked_at: next ? null : new Date().toISOString(),
        revoked_by: next ? null : user?.uid ?? "ADMIN",
      });
      toast(next ? t.syncActivatedToast : t.syncRevokedToast);
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  return (
    <>
      <PageHeader eyebrow={t.all} title={t.syncTitle} description={t.syncDesc}>
        <Button variant="secondary" icon="sync" onClick={() => location.reload()}>{t.refresh}</Button>
      </PageHeader>

      <div className="op-metrics">
        <Card className="metric-card"><div className="metric-top"><span>{t.syncTotalRecords}</span></div><strong>{all.length}</strong></Card>
        <Card className="metric-card"><div className="metric-top"><span>{t.syncSynced}</span><Icon name="check" size={16} /></div><strong>{counts.synced}</strong></Card>
        <Card className="metric-card"><div className="metric-top"><span>{t.syncPending}</span><Icon name="alert" size={16} /></div><strong>{counts.pending + counts.failed + counts.syncing}</strong></Card>
        <Card className="metric-card"><div className="metric-top"><span>{t.syncConflicts}</span><Icon name="alert" size={16} /></div><strong>{counts.conflict}</strong></Card>
      </div>

      <div className="dashboard-grid">
        <Card>
          <div className="card-head"><div><h2>{t.syncConnectionTitle}</h2><p>{t.syncCloud}</p></div></div>
          <div className="server-status" style={{ color: "var(--slate-700)" }}>
            <span className="pulse" style={{ background: navigator.onLine ? "#2ad49b" : "#e49419" }} />
            <div>
              <strong>{navigator.onLine ? t.syncOnline : t.syncOffline}</strong>
              <span style={{ fontSize: 11, color: "var(--slate-500)" }}>
                {t.syncLastUpdate}: {fmtDateTime(lastActivity) || "—"}
              </span>
            </div>
          </div>
          <p className="insight" style={{ marginTop: 12 }}><Icon name="sync" size={14} /> {t.syncOfflineNote}</p>
        </Card>

        <Card>
          <div className="card-head">
            <div><h2>{t.syncContractTitle}</h2><p>{t.syncContractDesc}</p></div>
            <Badge tone="success">{ADMIN_DEVICE_ID}</Badge>
          </div>
          <div className="table-scroll">
            <table>
              <tbody>
                <tr>
                  <td className="latin">{t.syncFieldUpdatedAt}</td>
                  <td className="latin">{new Date().toISOString()}</td>
                </tr>
                <tr>
                  <td className="latin">{t.syncFieldDevice}</td>
                  <td className="latin"><strong>{ADMIN_DEVICE_ID}</strong></td>
                </tr>
                <tr>
                  <td className="latin">{t.syncFieldVersion}</td>
                  <td>{t.syncVersionHint}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="insight" style={{ marginTop: 10 }}><Icon name="sync" size={14} /> {t.syncPullHint}</p>
        </Card>

        <Card>
          <div className="card-head">
            <div><h2>{t.syncDevicesTitle}</h2><p>{devices.length} · {t.syncDevicesHint}</p></div>
          </div>
          {devices.length === 0 ? <EmptyState icon="device" title={t.syncNoDevices} /> : (
            <div className="table-scroll"><table>
              <thead>
                <tr>
                  <th>{t.syncDeviceName}</th><th>{t.syncDeviceRole}</th>
                  <th>{t.syncDeviceRegistered}</th><th>{t.syncDeviceLastSeen}</th>
                  <th>{t.syncDeviceStatus}</th><th></th>
                </tr>
              </thead>
              <tbody>{byDateDesc(devices, "registered_at").map((dev) => {
                const active = isActive(dev);
                return (
                  <tr key={String(dev.id)}>
                    <td>{String(dev.name ?? dev.id)}</td>
                    <td>{String(dev.role ?? "—")}</td>
                    <td>{fmtDateTime(String(dev.registered_at ?? ""))}</td>
                    <td>{fmtDateTime(String(dev.last_seen ?? ""))}</td>
                    <td>
                      <Badge tone={active ? "success" : "danger"}>
                        {active ? t.syncDeviceActive : t.syncDeviceRevoked}
                      </Badge>
                    </td>
                    <td>
                      <div className="table-tools">
                        <button onClick={() => toggleDevice(dev)} title={active ? t.syncRevoke : t.syncActivate}>
                          {active ? <Icon name="alert" size={13} /> : <Icon name="check" size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </Card>

        <Card>
          <div className="card-head"><div><h2>{t.syncConflictTitle}</h2><p>{t.syncConflictHint}</p></div></div>
          {conflicts.length === 0 ? <p className="insight"><Icon name="check" size={14} /> {t.syncNoConflicts}</p> : (
            <div className="table-scroll"><table>
              <thead><tr><th>{t.ref}</th><th>{t.syncLastUpdate}</th></tr></thead>
              <tbody>{conflicts.slice(0, 20).map((c) => (
                <tr key={String(c.id)}>
                  <td className="latin">{String(c.ref_no ?? c.id)}</td>
                  <td>{fmtDateTime(String(c.updated_at ?? ""))}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          <div style={{ marginTop: 12 }}>
            <Badge tone={counts.conflict ? "danger" : "success"}>
              {counts.conflict ? `${counts.conflict} ${t.syncConflicts}` : t.syncAllGood}
            </Badge>
          </div>
        </Card>
      </div>
    </>
  );
}
