import { useState } from "react";
import { useAuth } from "../lib/auth";
import { Button, Field, useToast } from "../components/ui";
import { Icon } from "../components/Icons";

export default function Login() {
  const { login, bootstrapOwner } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<"login" | "bootstrap">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email || password.length < 6) { toast("ای میل اور 6+ حروف کا پاس ورڈ درکار ہے", "danger"); return; }
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await bootstrapOwner(email, password, fullName);
      toast("خوش آمدید");
    } catch (e) {
      const msg = (e as Error).message || "لاگ ان ناکام";
      if (msg.includes("not found") || msg.includes("(default)")) {
        toast("ڈیٹا بیس '(default)' دستیاب نہیں ہے۔ Firebase Console میں ڈیٹا بیس بنائیں", "danger");
      } else {
        toast(msg, "danger");
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" style={{ placeItems: "center" }}>
      <div className="modal" style={{ width: "min(430px,100%)" }}>
        <div className="modal-head" style={{ alignItems: "center" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span className="brand-mark" style={{ width: 44, height: 44 }}><Icon name="fuel" size={24} /></span>
            <div><h2 style={{ margin: 0 }}>پٹرولیم ڈپو</h2><p>ایڈمن ڈیش بورڈ</p></div>
          </div>
        </div>
        <div className="modal-body" style={{ background: "#fff" }}>
          <h3>{mode === "login" ? "لاگ ان" : "مالک اکاؤنٹ بنائیں"}</h3>
          <p className="center">{mode === "login" ? "جاری رکھنے کے لیے اپنے اکاؤنٹ سے لاگ ان کریں" : "پہلی بار سیٹ اپ: ڈپو کا مالک اکاؤنٹ بنائیں"}</p>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
            {mode === "bootstrap" && (
              <Field label="پورا نام"><input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
            )}
            <Field label="ای میل"><input className="latin" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></Field>
            <Field label="پاس ورڈ"><input className="latin" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
            <Button variant="primary" icon="logout" disabled={busy} onClick={submit}>
              {busy ? "انتظار…" : mode === "login" ? "لاگ ان" : "اکاؤنٹ بنائیں"}
            </Button>
          </div>
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button className="text-link" style={{ margin: "0 auto" }} onClick={() => setMode(mode === "login" ? "bootstrap" : "login")}>
              <Icon name={mode === "login" ? "plus" : "chevron"} size={13} />
              {mode === "login" ? "پہلی بار؟ مالک اکاؤنٹ بنائیں" : "واپس لاگ ان"}
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
