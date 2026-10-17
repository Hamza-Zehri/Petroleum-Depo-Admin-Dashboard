import { useMemo, useState } from "react";
import { createUserWithEmailAndPassword, signOut as fbSignOut } from "firebase/auth";
import { secondaryAuth } from "../lib/firebase";
import { Card, Button, PageHeader, Modal, Field, StatusBadge, EmptyState, useToast } from "../components/ui";
import { Icon } from "../components/Icons";
import { fmtDate, fmtDateTime } from "../lib/format";
import { createRecord, patchRecord, deleteRecord, useCollection, byDateDesc } from "../lib/repo";
import { ROLE_LABELS, can, type Role, type Perm } from "../lib/types";
import { useAuth } from "../lib/auth";

type Doc = Record<string, unknown>;
const ROLES: Role[] = ["owner", "manager", "accountant", "operator"];
const PERMS: Perm[] = ["receiveFuel", "loadFuel", "receivePayment", "paySupplier", "addExpense", "changeRates", "stockAdjust", "reverseTransaction", "viewFinancialReports", "closeDay", "manageUsers", "manageTanks", "manageMasterData", "exportBackup", "viewAudit"];
const PERM_LABELS: Record<Perm, string> = {
  receiveFuel: "ایندھن موصول", loadFuel: "ایندھن بھرائی", receivePayment: "وصولی", paySupplier: "سپلائر ادائیگی",
  addExpense: "خرچ", changeRates: "ریٹ تبدیلی", stockAdjust: "اسٹاک ایڈجسٹ", reverseTransaction: "منسوخی",
  viewFinancialReports: "مالی رپورٹس", closeDay: "دن بند", manageUsers: "صارفین", manageTanks: "ٹینکس",
  manageMasterData: "بنیادی ڈیٹا", exportBackup: "بیک اپ", viewAudit: "آڈٹ",
};

interface Form { email: string; password: string; full_name: string; role: Role }

export default function Users() {
  const toast = useToast();
  const { user: me } = useAuth();
  const { data: users, loading, error } = useCollection<Doc>("users", [], ["users-all"]);
  const [form, setForm] = useState<Form | null>(null);
  const [edit, setEdit] = useState<Doc | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => byDateDesc(users, "created_at"), [users]);

  async function createUser(f: Form) {
    if (!f.email || f.password.length < 6 || !f.full_name) { toast("تمام خانے بھریں (پاس ورڈ 6+ حروف)", "danger"); return; }
    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth(), f.email.trim(), f.password);
      await createRecord("users", { id: cred.user.uid, username: f.email.trim(), full_name: f.full_name, role: f.role, active: true, created_by: me?.uid }, { createdBy: me?.uid });
      await fbSignOut(secondaryAuth());
      toast("صارف بن گیا"); setForm(null);
    } catch (e) { toast((e as Error).message, "danger"); } finally { setBusy(false); }
  }

  async function saveEdit(doc: Doc, role: Role, active: boolean, fullName: string) {
    try { await patchRecord("users", String(doc.id), { role, active, full_name: fullName }); toast("اپ ڈیٹ"); setEdit(null); }
    catch (e) { toast((e as Error).message, "danger"); }
  }

  return (
    <>
      <PageHeader eyebrow="ڈپو" title="صارفین و اختیارات" description="اکاؤنٹس، کردار (roles) اور اجازتیں">
        <Button variant="primary" icon="plus" onClick={() => setForm({ email: "", password: "", full_name: "", role: "operator" })}>نیا صارف</Button>
      </PageHeader>

      {error && <div className="notice warning"><Icon name="alert" /><div><strong>اجازت نہیں</strong><span>{error}</span></div></div>}

      <Card>
        <div className="card-head"><div><h2>صارفین</h2><p>{rows.length} اکاؤنٹ</p></div></div>
        {loading ? <EmptyState icon="device" title="لوڈ ہو رہا ہے…" /> : rows.length === 0 ? <EmptyState icon="device" title="کوئی صارف نہیں" /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>نام</th><th>ای میل</th><th>کردار</th><th>حالت</th><th>آخری لاگ ان</th><th></th></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={String(u.id)}>
                  <td>{String(u.full_name)} {String(u.id) === me?.uid && <small style={{ color: "var(--green-700)" }}>(آپ)</small>}</td>
                  <td className="latin">{String(u.username)}</td>
                  <td>{ROLE_LABELS[(u.role as Role) ?? "operator"]}</td>
                  <td><StatusBadge status={u.active === false ? "failed" : "active"} /></td>
                  <td>{fmtDateTime(String(u.last_login ?? "")) || "—"}</td>
                  <td>
                    <div className="table-tools">
                      <button onClick={() => setEdit(u)} title="ترمیم"><Icon name="file" size={13} /></button>
                      <button onClick={async () => { if (String(u.id) === me?.uid) { toast("خود کو حذف نہیں کر سکتے", "danger"); return; } if (!confirm("پروفائل حذف کریں؟")) return; try { await deleteRecord("users", String(u.id)); toast("حذف"); } catch (e) { toast((e as Error).message, "danger"); } }} title="حذف">×</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      <Card>
        <div className="card-head"><div><h2>اجازت میٹرکس</h2><p>کردار کے مطابق اجازتیں</p></div></div>
        <div className="table-scroll"><table>
          <thead><tr><th>اجازت</th>{ROLES.map((r) => <th key={r}>{ROLE_LABELS[r]}</th>)}</tr></thead>
          <tbody>{PERMS.map((p) => (<tr key={p}><td>{PERM_LABELS[p]}</td>{ROLES.map((r) => <td key={r}>{can(r, p) ? <Badge tone="success" /> : <span style={{ color: "var(--slate-300)" }}>—</span>}</td>)}</tr>))}</tbody>
        </table></div>
      </Card>

      {form && (
        <Modal title="نیا صارف" onClose={() => setForm(null)} footer={<>
          <Button onClick={() => setForm(null)}>منسوخ</Button>
          <Button variant="primary" disabled={busy} onClick={() => createUser(form)}>اکاؤنٹ بنائیں</Button>
        </>}>
          <div className="form-grid">
            <Field label="پورا نام" full><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
            <Field label="ای میل"><input className="latin" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="پاس ورڈ"><input className="latin" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            <Field label="کردار">
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
            </Field>
          </div>
          <p className="insight" style={{ marginTop: 12 }}><Icon name="alert" size={14} /> اکاؤنٹ Firebase Auth میں بنتا ہے؛ لاگ ان کی اجازت Firestore رولز سے مشروط ہے۔</p>
        </Modal>
      )}

      {edit && <EditUser u={edit} onClose={() => setEdit(null)} onSave={saveEdit} />}
    </>
  );
}

function Badge({ tone }: { tone: string }) { return <span className={`badge badge-${tone}`}><span className="badge-dot" /></span>; }

function EditUser({ u, onClose, onSave }: { u: Doc; onClose: () => void; onSave: (d: Doc, r: Role, a: boolean, n: string) => void }) {
  const [role, setRole] = useState<Role>((u.role as Role) ?? "operator");
  const [active, setActive] = useState(u.active !== false);
  const [name, setName] = useState(String(u.full_name));
  return (
    <Modal title={`ترمیم — ${name}`} onClose={onClose} footer={<>
      <Button onClick={onClose}>منسوخ</Button>
      <Button variant="primary" onClick={() => onSave(u, role, active, name)}>محفوظ کریں</Button>
    </>}>
      <div className="form-grid">
        <Field label="پورا نام" full><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="کردار"><select value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></Field>
        <Field label="فعال"><select value={String(active)} onChange={(e) => setActive(e.target.value === "true")}><option value="true">ہاں</option><option value="false">نہیں</option></select></Field>
      </div>
    </Modal>
  );
}
