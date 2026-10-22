import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Button, PageHeader, Field, useToast } from "../components/ui";
import { Icon } from "../components/Icons";
import { useSettings, setSetting } from "../lib/repo";
import { useAuth } from "../lib/auth";
import { ROLE_LABELS } from "../lib/types";
import { useLang } from "../lib/lang";
import { useTheme } from "../lib/theme";

const FIELDS: { key: string; label: string; latin?: boolean; type?: string }[] = [
  { key: "depot_name", label: "ڈپو کا نام" },
  { key: "depot_contact", label: "رابطہ نمبر", latin: true },
  { key: "depot_address", label: "پتہ" },
  { key: "currency", label: "کرنسی علامت", latin: true },
  { key: "business_day_start_hour", label: "کاروباری دن شروع گھنٹہ", latin: true, type: "number" },
  { key: "receipt_width", label: "رسید چوڑائی (mm)", latin: true, type: "number" },
  { key: "petrol_rate", label: "پٹرول کا موجودہ ریٹ", latin: true },
  { key: "diesel_rate", label: "ڈیزل کا موجودہ ریٹ", latin: true },
  { key: "low_stock_threshold", label: "کم اسٹاک حد (%)", latin: true, type: "number" },
];

export default function Settings() {
  const { settings } = useSettings();
  const { user } = useAuth();
  const toast = useToast();
  const { t } = useLang();
  const { lang, setLang } = useLang();
  const { theme, setTheme } = useTheme();
  const nav = useNavigate();
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { setForm({ ...settings }); }, [settings]);

  async function saveAll() {
    setBusy(true);
    try {
      for (const f of FIELDS) if (form[f.key] !== undefined) await setSetting(f.key, form[f.key] ?? "");
      toast("ترتیبات محفوظ ہو گئیں");
    } catch (e) { toast((e as Error).message, "danger"); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader eyebrow={t.all} title={t.settings} description={t.settingsDesc ?? "Settings"}>
        <Button variant="primary" icon="check" disabled={busy} onClick={saveAll}>محفوظ کریں</Button>
      </PageHeader>

      <div className="settings-layout">
        <Card className="settings-nav">
          <button className="active">ڈپو کی معلومات <Icon name="chevron" size={13} /></button>
          <button onClick={() => nav("/users")}>صارفین <Icon name="chevron" size={13} /></button>
          <button onClick={() => nav("/backups")}>بیک اپ</button>
          <button onClick={() => nav("/sync")}>سنک</button>
          <button onClick={() => nav("/receipts")}>رسید ترتیبات</button>
        </Card>

        <Card className="settings-form">
          <div className="card-head"><div><h2>ڈپو کی معلومات</h2><p>رسیدوں اور رپورٹس پر ظاہر ہوتی ہیں</p></div>
            <span className="badge badge-info">{user ? ROLE_LABELS[user.role] : ""}</span>
          </div>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <Field key={f.key} label={f.label} full={!f.latin}>
                <input className={f.latin ? "latin" : ""} type={f.type ?? "text"} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </Field>
            ))}
          </div>
          <div className="form-actions">
            <Button variant="primary" icon="check" disabled={busy} onClick={saveAll}>محفوظ کریں</Button>
          </div>
        </Card>
      </div>

      <Card>
        <div className="card-head"><div><h2>تیز روابط</h2><p>انتظامی صفحات</p></div></div>
        <div className="quick-grid">
          <Button icon="device" onClick={() => nav("/users")}>صارفین</Button>
          <Button icon="shield" onClick={() => nav("/backups")}>بیک اپ</Button>
          <Button icon="sync" onClick={() => nav("/sync")}>سنک</Button>
          <Button icon="print" onClick={() => nav("/receipts")}>رسیدیں</Button>
          <Button icon="tank" onClick={() => nav("/stock")}>ٹینکس</Button>
          <Button icon="chart" onClick={() => nav("/reports")}>رپورٹس</Button>
        </div>
      </Card>

      <div className="notice" style={{ marginTop: 14 }}>
        <Icon name="shield" /><div><strong>سیکیورٹی</strong><span>نقشِ راست (firestore.rules) میں کردار کے مطابق رسائی محدود ہے۔ ریٹ تبدیلی و منسوخی صرف مجاز کردار کر سکتے ہیں۔</span></div>
      </div>

      <Card className="settings-form" style={{ marginTop: 16 }}>
        <div className="card-head"><div><h2>Language / زبان</h2><p>Switch the dashboard language</p></div></div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant={lang === "en" ? "primary" : "secondary"} onClick={() => setLang("en")}>English</Button>
          <Button variant={lang === "ur" ? "primary" : "secondary"} onClick={() => setLang("ur")}>اردو</Button>
        </div>
      </Card>

      <Card className="settings-form" style={{ marginTop: 16 }}>
        <div className="card-head"><div><h2>Theme / تھیم</h2><p>Light or dark mode</p></div></div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant={theme === "light" ? "primary" : "secondary"} onClick={() => setTheme("light")}>☀ Light</Button>
          <Button variant={theme === "dark" ? "primary" : "secondary"} onClick={() => setTheme("dark")}>🌙 Dark</Button>
        </div>
      </Card>
    </>
  );
}
