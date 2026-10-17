import { useState } from "react";
import { useAuth } from "../lib/auth";
import { Button, Field, useToast } from "../components/ui";
import { Icon } from "../components/Icons";

// Shown when a Firebase Auth account exists (e.g. one created in the Firebase
// console) but has no `users/{uid}` profile yet. Claiming makes it the depot
// owner and writes the one-time `settings/__bootstrap__` lock atomically, so it
// only works while the depot has no owner.
export default function ClaimOwner() {
  const { user, claimOwner, logout } = useAuth();
  const toast = useToast();
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  async function claim() {
    setBusy(true);
    try {
      await claimOwner(fullName);
      toast("مالک اکاؤنٹ فعال ہو گیا");
    } catch (e) {
      toast((e as Error).message || "دعویٰ ناکام — شاید پہلے سے کوئی مالک موجود ہے", "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: "min(520px, 100%)" }}>
        <div className="modal-head">
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span className="brand-mark" style={{ width: 44, height: 44 }}><Icon name="shield" size={24} /></span>
            <div><h2 style={{ margin: 0 }}>مالک اکاؤنٹ فعال کریں</h2><p>{user?.email}</p></div>
          </div>
        </div>
        <div className="modal-body" style={{ background: "#fff" }}>
          <p className="center">
            یہ Firebase اکاؤنٹ ابھی ڈپو سے منسلک نہیں۔ اگر ڈپو کا کوئی مالک موجود نہیں تو آپ
            اس اکاؤنٹ کو مالک بنا سکتے ہیں۔ بصورتِ دیگر مالک کو اپنے صارفین کے صفحے سے آپ کو
            شامل کرنا ہوگا۔
          </p>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
            <Field label="پورا نام"><input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="ڈپو مالک" /></Field>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
            <Button onClick={logout} icon="logout">دوسرا اکاؤنٹ</Button>
            <Button variant="primary" icon="check" disabled={busy} onClick={claim}>
              {busy ? "انتظار…" : "مالک بن جائیں"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
