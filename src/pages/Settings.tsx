import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Button, PageHeader, Field, Modal, useToast } from "../components/ui";
import { Icon } from "../components/Icons";
import { useSettings, setSetting } from "../lib/repo";
import { factoryResetCloudData } from "../lib/factoryReset";
import { useAuth } from "../lib/auth";
import { roleLabel } from "../lib/labels";
import { useLang } from "../lib/lang";
import { useTheme } from "../lib/theme";

const FIELDS: { key: string; labelKey: "depotName" | "contactNumber" | "address" | "currencySymbol" | "businessStartHour" | "receiptWidth" | "petrolRate" | "dieselRate" | "lowStockThreshold"; latin?: boolean; type?: string }[] = [
  { key: "depot_name", labelKey: "depotName" },
  { key: "depot_contact", labelKey: "contactNumber", latin: true },
  { key: "depot_address", labelKey: "address" },
  { key: "currency", labelKey: "currencySymbol", latin: true },
  { key: "business_day_start_hour", labelKey: "businessStartHour", latin: true, type: "number" },
  { key: "receipt_width", labelKey: "receiptWidth", latin: true, type: "number" },
  { key: "petrol_rate", labelKey: "petrolRate", latin: true },
  { key: "diesel_rate", labelKey: "dieselRate", latin: true },
  { key: "low_stock_threshold", labelKey: "lowStockThreshold", latin: true, type: "number" },
];

export default function Settings() {
  const { settings } = useSettings();
  const { user } = useAuth();
  const toast = useToast();
  const { t, lang, setLang } = useLang();
  const { theme, setTheme } = useTheme();
  const nav = useNavigate();
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetProgress, setResetProgress] = useState("");
  const [resetError, setResetError] = useState("");
  const isOwner = user?.role === "owner";

  useEffect(() => { setForm({ ...settings }); }, [settings]);

  async function saveAll() {
    setBusy(true);
    try {
      for (const f of FIELDS) if (form[f.key] !== undefined) await setSetting(f.key, form[f.key] ?? "");
      toast(t.settingsSaved);
    } catch (e) { toast((e as Error).message, "danger"); } finally { setBusy(false); }
  }

  function openReset() {
    setResetText("");
    setResetProgress("");
    setResetError("");
    setResetOpen(true);
  }

  async function doReset() {
    if (!user || !isOwner || resetText.trim().toUpperCase() !== "RESET") return;
    setResetBusy(true);
    setResetError("");
    setResetProgress(t.factoryResetRunning);
    try {
      const result = await factoryResetCloudData(user.uid, (p) => {
        setResetProgress(`${t.factoryResetProgress} ${p.collection} · ${p.deleted} (${p.totalDeleted})`);
      });
      toast(`${t.factoryResetSuccess} · ${result.totalDeleted}`);
      setResetOpen(false);
      // Let the toast render before reloading into a clean dashboard.
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      const message = (e as Error).message || t.factoryResetError;
      setResetError(message);
      toast(t.factoryResetError, "danger");
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow={t.all} title={t.settings} description={t.settingsDesc}>
        <Button variant="primary" icon="check" disabled={busy} onClick={saveAll}>{t.save}</Button>
      </PageHeader>

      <div className="settings-layout">
        <Card className="settings-nav">
          <button className="active">{t.depotInfo} <Icon name="chevron" size={13} /></button>
          <button onClick={() => nav("/users")}>{t.nav.users} <Icon name="chevron" size={13} /></button>
          <button onClick={() => nav("/backups")}>{t.nav.backups}</button>
          <button onClick={() => nav("/sync")}>{t.nav.sync}</button>
          <button onClick={() => nav("/receipts")}>{t.receiptSettings}</button>
          {isOwner && (
            <button className="danger-text" onClick={openReset}>
              {t.factoryReset} <Icon name="alert" size={13} />
            </button>
          )}
        </Card>

        <Card className="settings-form">
          <div className="card-head"><div><h2>{t.depotInfo}</h2><p>{t.shownOnReceipts}</p></div>
            <span className="badge badge-info">{user ? roleLabel(user.role, t) : ""}</span>
          </div>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <Field key={f.key} label={t[f.labelKey]} full={!f.latin}>
                <input className={f.latin ? "latin" : ""} type={f.type ?? "text"} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </Field>
            ))}
          </div>
          <div className="form-actions">
            <Button variant="primary" icon="check" disabled={busy} onClick={saveAll}>{t.save}</Button>
          </div>
        </Card>
      </div>

      <Card>
        <div className="card-head"><div><h2>{t.quickLinks}</h2><p>{t.adminPages}</p></div></div>
        <div className="quick-grid">
          <Button icon="device" onClick={() => nav("/users")}>{t.nav.users}</Button>
          <Button icon="shield" onClick={() => nav("/backups")}>{t.nav.backups}</Button>
          <Button icon="sync" onClick={() => nav("/sync")}>{t.nav.sync}</Button>
          <Button icon="print" onClick={() => nav("/receipts")}>{t.receiptsList}</Button>
          <Button icon="tank" onClick={() => nav("/stock")}>{t.tank}</Button>
          <Button icon="chart" onClick={() => nav("/reports")}>{t.nav.reports}</Button>
        </div>
      </Card>

      <div className="notice" style={{ marginTop: 14 }}>
        <Icon name="shield" /><div><strong>{t.security}</strong><span>{t.securityDesc}</span></div>
      </div>

      <Card className="settings-form" style={{ marginTop: 16 }}>
        <div className="card-head"><div><h2>{t.language}</h2><p>{t.languageDesc}</p></div></div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant={lang === "en" ? "primary" : "secondary"} onClick={() => setLang("en")}>English</Button>
          <Button variant={lang === "ur" ? "primary" : "secondary"} onClick={() => setLang("ur")}>{lang === "en" ? "Urdu" : "اردو"}</Button>
        </div>
      </Card>

      <Card className="settings-form" style={{ marginTop: 16 }}>
        <div className="card-head"><div><h2>{t.theme}</h2><p>{t.themeDesc}</p></div></div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant={theme === "light" ? "primary" : "secondary"} onClick={() => setTheme("light")}>☀ {t.light}</Button>
          <Button variant={theme === "dark" ? "primary" : "secondary"} onClick={() => setTheme("dark")}>🌙 {t.dark}</Button>
        </div>
      </Card>

      <Card className="settings-form" style={{ marginTop: 16, borderColor: "var(--red-700)" }}>
        <div className="card-head">
          <div>
            <h2 className="danger-text">{t.factoryReset}</h2>
            <p>{t.factoryResetDesc}</p>
          </div>
          <span className="badge badge-danger">{t.factoryResetDanger}</span>
        </div>
        <div className="notice warning">
          <Icon name="alert" />
          <div><strong>{t.factoryReset}</strong><span>{t.factoryResetWarning}</span></div>
        </div>
        <p className="insight"><Icon name="shield" size={14} /> {t.factoryResetKeep}</p>
        {isOwner ? (
          <div className="card-actions" style={{ marginTop: 12 }}>
            <Button variant="danger" icon="alert" onClick={openReset}>{t.factoryResetButton}</Button>
            <Button icon="download" onClick={() => nav("/backups")}>{t.factoryResetDownloadBackup}</Button>
          </div>
        ) : (
          <p className="danger-text"><Icon name="alert" size={13} /> {t.factoryResetNotOwner}</p>
        )}
      </Card>

      {resetOpen && (
        <Modal
          title={t.factoryResetConfirmTitle}
          onClose={() => { if (!resetBusy) setResetOpen(false); }}
          footer={
            <>
              <Button onClick={() => setResetOpen(false)} disabled={resetBusy}>{t.cancel}</Button>
              <Button
                variant="danger"
                icon="alert"
                disabled={resetBusy || resetText.trim().toUpperCase() !== "RESET"}
                onClick={doReset}
              >
                {resetBusy ? t.factoryResetRunning : t.factoryResetConfirm}
              </Button>
            </>
          }
        >
          <div className="notice warning" style={{ marginBottom: 14 }}>
            <Icon name="alert" />
            <div><strong>{t.factoryResetDanger}</strong><span>{t.factoryResetWarning}</span></div>
          </div>
          <p className="insight"><Icon name="shield" size={14} /> {t.factoryResetKeep}</p>
          <Field label={t.factoryResetType} full>
            <input
              className="latin"
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              placeholder="RESET"
              autoFocus
              disabled={resetBusy}
            />
          </Field>
          {resetBusy && (
            <div className="notice" style={{ marginTop: 14 }}>
              <span className="spinner" />
              <div><strong>{t.factoryResetRunning}</strong><span>{resetProgress}</span></div>
            </div>
          )}
          {resetError && (
            <div className="notice warning" style={{ marginTop: 14 }}>
              <Icon name="alert" />
              <div><strong>{t.factoryResetError}</strong><span>{resetError}</span></div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
