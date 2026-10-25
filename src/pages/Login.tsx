import { useState } from "react";
import { useAuth } from "../lib/auth";
import { useLang } from "../lib/lang";
import { useTheme } from "../lib/theme";
import { Button, Field, useToast } from "../components/ui";
import { Icon } from "../components/Icons";

export default function Login() {
  const { login, bootstrapOwner } = useAuth();
  const { t, lang, setLang } = useLang();
  const { theme, toggle: toggleTheme } = useTheme();
  const toast = useToast();
  const [mode, setMode] = useState<"login" | "bootstrap">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email || password.length < 6) { toast(t.loginError, "danger"); return; }
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await bootstrapOwner(email, password, fullName);
      toast(t.loginSuccess);
    } catch (e) {
      const msg = (e as Error).message || "";
      if (msg.includes("not found") || msg.includes("(default)")) {
        toast(t.firestoreSetup, "danger");
      } else {
        toast(msg || t.loginError, "danger");
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" style={{ placeItems: "center" }}>
      <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 8 }}>
        <button className="btn btn-secondary" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => setLang(lang === "en" ? "ur" : "en")}>
          {lang === "en" ? "Urdu" : "English"}
        </button>
        <button className="btn btn-secondary" style={{ padding: "6px 10px", fontSize: 12 }} onClick={toggleTheme}>
          {theme === "dark" ? "☀" : "🌙"}
        </button>
      </div>
      <div className="modal" style={{ width: "min(430px,100%)" }}>
        <div className="modal-head" style={{ alignItems: "center" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span className="brand-mark" style={{ width: 44, height: 44 }}><Icon name="fuel" size={24} /></span>
            <div><h2 style={{ margin: 0 }}>{t.appName}</h2><p>{t.adminDashboard}</p></div>
          </div>
        </div>
        <div className="modal-body">
          <h3>{mode === "login" ? t.login : t.createOwner}</h3>
          <p className="center">{mode === "login" ? t.loginSub : t.createOwnerHint}</p>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
            {mode === "bootstrap" && (
              <Field label={t.fullName}><input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
            )}
            <Field label={t.email}><input className="latin" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></Field>
            <Field label={t.password}><input className="latin" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
            <Button variant="primary" icon="logout" disabled={busy} onClick={submit}>
              {busy ? t.loading : (mode === "login" ? t.login : t.createOwner)}
            </Button>
          </div>
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button className="text-link" style={{ margin: "0 auto" }} onClick={() => setMode(mode === "login" ? "bootstrap" : "login")}>
              <Icon name={mode === "login" ? "plus" : "chevron"} size={13} />
              {mode === "login" ? t.createOwner : t.back}
            </button>
          </div>
        </div>
        <div className="modal-foot" style={{ justifyContent: "center" }}>
          <span className="latin" style={{ fontSize: 10, color: "var(--slate-500)" }}>petroleum-depot · Firebase</span>
        </div>
      </div>
    </div>
  );
}