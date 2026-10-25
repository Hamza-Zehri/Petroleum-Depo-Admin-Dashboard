import { useMemo, useState } from "react";
import { createUserWithEmailAndPassword, signOut as fbSignOut } from "firebase/auth";
import { secondaryAuth } from "../lib/firebase";
import { Card, Button, PageHeader, Modal, Field, StatusBadge, EmptyState, useToast } from "../components/ui";
import { Icon } from "../components/Icons";
import { fmtDate, fmtDateTime } from "../lib/format";
import { createRecord, patchRecord, deleteRecord, useCollection, byDateDesc } from "../lib/repo";
import { can, type Role, type Perm } from "../lib/types";
import { useAuth } from "../lib/auth";
import { useLang } from "../lib/lang";
import { permLabel, roleLabel } from "../lib/labels";

type Doc = Record<string, unknown>;
const ROLES: Role[] = ["owner", "manager", "accountant", "operator"];
const PERMS: Perm[] = ["receiveFuel", "loadFuel", "receivePayment", "paySupplier", "addExpense", "changeRates", "stockAdjust", "reverseTransaction", "viewFinancialReports", "closeDay", "manageUsers", "manageTanks", "manageMasterData", "exportBackup", "viewAudit"];

interface Form { email: string; password: string; full_name: string; role: Role }

export default function Users() {
  const toast = useToast();
  const { t } = useLang();
  const { user: me } = useAuth();
  const { data: users, loading, error } = useCollection<Doc>("users", [], ["users-all"]);
  const [form, setForm] = useState<Form | null>(null);
  const [edit, setEdit] = useState<Doc | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => byDateDesc(users, "created_at"), [users]);

  async function createUser(f: Form) {
    if (!f.email || f.password.length < 6 || !f.full_name) { toast(t.allFieldsRequired, "danger"); return; }
    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth(), f.email.trim(), f.password);
      await createRecord("users", { id: cred.user.uid, username: f.email.trim(), full_name: f.full_name, role: f.role, active: true, created_by: me?.uid }, { createdBy: me?.uid });
      await fbSignOut(secondaryAuth());
      toast(t.accountCreated); setForm(null);
    } catch (e) { toast((e as Error).message, "danger"); } finally { setBusy(false); }
  }

  async function saveEdit(doc: Doc, role: Role, active: boolean, fullName: string) {
    try { await patchRecord("users", String(doc.id), { role, active, full_name: fullName }); toast(t.userUpdated); setEdit(null); }
    catch (e) { toast((e as Error).message, "danger"); }
  }

  return (
    <>
      <PageHeader eyebrow={t.all} title={t.usersTitle} description={t.usersDesc}>
        <Button variant="primary" icon="plus" onClick={() => setForm({ email: "", password: "", full_name: "", role: "operator" })}>{t.newUser}</Button>
      </PageHeader>

      {error && <div className="notice warning"><Icon name="alert" /><div><strong>{t.noPermission}</strong><span>{error}</span></div></div>}

      <Card>
        <div className="card-head"><div><h2>{t.nav.users}</h2><p>{rows.length} {t.accountsCount}</p></div></div>
        {loading ? <EmptyState icon="device" title={t.loadingUsers} /> : rows.length === 0 ? <EmptyState icon="device" title={t.noUsers} /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>{t.name}</th><th>{t.email}</th><th>{t.role}</th><th>{t.statusHeader}</th><th>{t.lastLogin}</th><th></th></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={String(u.id)}>
                  <td>{String(u.full_name)} {String(u.id) === me?.uid && <small style={{ color: "var(--green-700)" }}>{t.you}</small>}</td>
                  <td className="latin">{String(u.username)}</td>
                  <td>{roleLabel(String(u.role), t)}</td>
                  <td><StatusBadge status={u.active === false ? "inactive" : "active"} /></td>
                  <td>{fmtDateTime(String(u.last_login ?? "")) || "—"}</td>
                  <td>
                    <div className="table-tools">
                      <button onClick={() => setEdit(u)} title={t.edit}><Icon name="file" size={13} /></button>
                      <button onClick={async () => { if (String(u.id) === me?.uid) { toast(t.cannotDeleteSelf, "danger"); return; } if (!confirm(t.confirmDeleteProfile)) return; try { await deleteRecord("users", String(u.id)); toast(t.deleted); } catch (e) { toast((e as Error).message, "danger"); } }} title={t.delete}>×</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      <Card>
        <div className="card-head"><div><h2>{t.permissionMatrix}</h2><p>{t.rolePermissions}</p></div></div>
        <div className="table-scroll"><table>
          <thead><tr><th>{t.permissionCol}</th>{ROLES.map((r) => <th key={r}>{roleLabel(r, t)}</th>)}</tr></thead>
          <tbody>{PERMS.map((p) => (<tr key={p}><td>{permLabel(p, t)}</td>{ROLES.map((r) => <td key={r}>{can(r, p) ? <Badge tone="success" /> : <span style={{ color: "var(--slate-500)" }}>—</span>}</td>)}</tr>))}</tbody>
        </table></div>
      </Card>

      {form && (
        <Modal title={t.newUser} onClose={() => setForm(null)} footer={<>
          <Button onClick={() => setForm(null)}>{t.cancel}</Button>
          <Button variant="primary" disabled={busy} onClick={() => createUser(form)}>{t.createAccount}</Button>
        </>}>
          <div className="form-grid">
            <Field label={t.fullName} full><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
            <Field label={t.email}><input className="latin" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label={t.password}><input className="latin" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            <Field label={t.role}>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r} value={r}>{roleLabel(r, t)}</option>)}</select>
            </Field>
          </div>
          <p className="insight" style={{ marginTop: 12 }}><Icon name="alert" size={14} /> {t.accountInFirebase}</p>
        </Modal>
      )}

      {edit && <EditUser u={edit} onClose={() => setEdit(null)} onSave={saveEdit} />}
    </>
  );
}

function Badge({ tone }: { tone: string }) { return <span className={`badge badge-${tone}`}><span className="badge-dot" /></span>; }

function EditUser({ u, onClose, onSave }: { u: Doc; onClose: () => void; onSave: (d: Doc, r: Role, a: boolean, n: string) => void }) {
  const { t } = useLang();
  const [role, setRole] = useState<Role>((u.role as Role) ?? "operator");
  const [active, setActive] = useState(u.active !== false);
  const [name, setName] = useState(String(u.full_name));
  return (
    <Modal title={`${t.editUser} — ${name}`} onClose={onClose} footer={<>
      <Button onClick={onClose}>{t.cancel}</Button>
      <Button variant="primary" onClick={() => onSave(u, role, active, name)}>{t.save}</Button>
    </>}>
      <div className="form-grid">
        <Field label={t.fullName} full><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t.role}><select value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{roleLabel(r, t)}</option>)}</select></Field>
        <Field label={t.active}><select value={String(active)} onChange={(e) => setActive(e.target.value === "true")}><option value="true">{t.yes}</option><option value="false">{t.no}</option></select></Field>
      </div>
    </Modal>
  );
}
