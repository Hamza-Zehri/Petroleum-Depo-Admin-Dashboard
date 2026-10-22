import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "./Icons";
import { useAuth } from "../lib/auth";
import { useSettings, useCollection } from "../lib/repo";
import { ROLE_LABELS } from "../lib/types";
import { fmtTime } from "../lib/format";
import { useLang } from "../lib/lang";

const NAV = [
  { to: "/dashboard", key: "dashboard", icon: "grid" },
  { to: "/stock", key: "stock", icon: "tank" },
  { to: "/purchases", key: "purchases", icon: "truck" },
  { to: "/sales", key: "sales", icon: "fuel" },
  { to: "/customers", key: "customers", icon: "users" },
  { to: "/suppliers", key: "suppliers", icon: "box" },
  { to: "/cashbook", key: "cashbook", icon: "wallet" },
  { to: "/expenses", key: "expenses", icon: "download" },
  { to: "/profit", key: "profit", icon: "chart" },
  { to: "/reports", key: "reports", icon: "file" },
  { to: "/closing", key: "closing", icon: "check" },
  { to: "/users", key: "users", icon: "device" },
  { to: "/sync", key: "sync", icon: "sync" },
  { to: "/receipts", key: "receipts", icon: "print" },
  { to: "/backups", key: "backups", icon: "shield" },
  { to: "/settings", key: "settings", icon: "settings" },
] as const;

function useLastActivity(): string {
  const { data } = useCollection<{ updated_at?: string }>("purchases", [], ["last-act-p"]);
  const { data: sales } = useCollection<{ created_at?: string }>("sales", [], ["last-act-s"]);
  return useMemo(() => {
    const all = [...data.map((d) => d.updated_at ?? ""), ...sales.map((d) => d.created_at ?? "")]
      .filter(Boolean).sort();
    return all.length ? all[all.length - 1] : "";
  }, [data, sales]);
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { settings, error: settingsError } = useSettings();
  const { t, lang, setLang } = useLang();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const loc = useLocation();
  const nav = useNavigate();
  const lastActivity = useLastActivity();

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const depotName = settings.depot_name || "پٹرولیم ڈپو";
  const initials = (user?.fullName ?? "؟").trim().slice(0, 1);
  const currentTitle = NAV.find((n) => loc.pathname.startsWith(n.to));

  return (
    <div className={`app ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <img src="/icon.png" alt="Logo" style={{ width: 26, height: 26, objectFit: "contain", borderRadius: 6 }} />
          </span>
          <div><strong>{depotName}</strong><small>{t.appSub}</small></div>
          <button className="collapse" onClick={() => setCollapsed(!collapsed)} aria-label="مینو"><Icon name="menu" /></button>
        </div>
        <nav aria-label="مرکزی نیویگیشن">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? "active" : "")} title={t.nav[n.key]}>
              <Icon name={n.icon} /><span>{t.nav[n.key]}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="server-status">
            <span className="pulse" style={{ background: online ? "#2ad49b" : "#e49419" }} />
            <div>
              <strong>{online ? "کلاؤڈ سے جڑا ہوا" : "آف لائن"}</strong>
              <small>{lastActivity ? `آخری فعالیت ${fmtTime(lastActivity)}` : "Firestore · لائیو"}</small>
            </div>
          </div>
          <div className="depot-mini">
            <span>{initials}</span>
            <div><strong>{user?.fullName ?? "—"}</strong><small>{user ? ROLE_LABELS[user.role] : ""}</small></div>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setCollapsed(!collapsed)} aria-label="مینو"><Icon name="menu" /></button>
          <div className="global-search">
            <Icon name="search" />
            <input placeholder="گاہک، رسید، گاڑی تلاش کریں…" aria-label="گلوبل تلاش"
              onKeyDown={(e) => { if (e.key === "Enter") nav("/reports"); }} />
            <kbd className="latin">Ctrl K</kbd>
          </div>
          <div className="top-status">
            <div style={{ paddingInlineStart: 13 }}>
              <span className={`status-dot ${online ? "success" : "warning"}`} />
              <small>کلاؤڈ سنک</small>
              <strong>{online ? "فعال" : "زیرِ التوا"}</strong>
            </div>
          </div>
          <button className="bell" aria-label="اطلاعات"><Icon name="bell" /><span className="latin">0</span></button>
          <button className="btn btn-secondary" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => setLang(lang === "en" ? "ur" : "en")} aria-label="Language">
            {lang === "en" ? "اردو" : "English"}
          </button>
          <div className="profile-wrap">
            <button className="profile" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen}>
              <span>{initials}</span>
              <div><strong>{user?.fullName}</strong><small>{user ? ROLE_LABELS[user.role] : ""}</small></div>
              <span>⌄</span>
            </button>
            {menuOpen && (
              <div className="profile-menu" role="menu">
                <div className="pm-head"><strong>{user?.email}</strong><small>{user ? ROLE_LABELS[user.role] : ""}</small></div>
                <button role="menuitem" onClick={() => { setMenuOpen(false); nav("/settings"); }}><Icon name="settings" size={15} /> ڈپو کی ترتیبات</button>
                <button role="menuitem" className="danger" onClick={() => logout()}><Icon name="logout" size={15} /> {t.logout}</button>
              </div>
            )}
          </div>
        </header>
        <main>
          {settingsError && settingsError.toLowerCase().includes("not found") && (
            <div style={{
              background: "#FFF5DC",
              color: "#A85E08",
              border: "1px solid #F6D68F",
              borderRadius: 8,
              padding: "12px 16px",
              margin: "16px 24px 0",
              fontSize: 14,
              lineHeight: 1.6,
            }}>
              <strong>توجہ: Firebase Firestore ڈیٹا بیس تلاش نہیں ہو سکا (Database '(default)' not found)۔</strong>
              <div style={{ marginTop: 4, fontSize: 13, color: "#744204" }}>
                Firebase Console (<a href="https://console.firebase.google.com/project/petroleum-depot/firestore" target="_blank" rel="noreferrer" style={{ textDecoration: "underline", fontWeight: 700 }}>console.firebase.google.com</a>) پر جائیں اور <strong>Build &gt; Firestore Database</strong> میں جا کر <strong>"Create database"</strong> منتخب کریں تاکہ کلاؤڈ ڈیٹا فعال ہو سکے۔
              </div>
            </div>
          )}
          <h2 className="sr-only">{currentTitle ? t.nav[currentTitle.key] : ""}</h2>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
