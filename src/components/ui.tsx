import { createContext, useCallback, useContext, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "./Icons";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export function Card({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <section className={`card ${className}`} style={style}>{children}</section>;
}

export function Button({
  children, variant = "secondary", icon, onClick, disabled = false, type = "button",
}: {
  children?: ReactNode; variant?: "primary" | "secondary" | "danger" | "ghost";
  icon?: string; onClick?: () => void; disabled?: boolean; type?: "button" | "submit";
}) {
  return (
    <button type={type} className={`btn btn-${variant}`} onClick={onClick} disabled={disabled}>
      {icon && <Icon name={icon} size={16} />}<span>{children}</span>
    </button>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`badge badge-${tone}`}><span className="badge-dot" />{children}</span>;
}

export function Progress({ value, tone = "success", label }: { value: number; tone?: Tone; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="progress-wrap" role="progressbar" aria-label={`${label}: ${v}%`} aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-track"><span className={`progress-fill fill-${tone}`} style={{ width: `${v}%` }} /></div>
      <span>{v}%</span>
    </div>
  );
}

export function Metric({
  label, value, meta, tone = "info", icon = "chart", onClick,
}: { label: string; value: string; meta: string; tone?: Tone; icon?: string; onClick?: () => void }) {
  return (
    <Card className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon tone-${tone}`}><Icon name={icon} size={17} /></span>
      </div>
      <strong>{value}</strong>
      {onClick ? (
        <button className="text-link" onClick={onClick}>{meta} <Icon name="chevron" size={13} /></button>
      ) : (
        <span className="text-link" style={{ cursor: "default" }}>{meta}</span>
      )}
    </Card>
  );
}

export function PageHeader({
  eyebrow, title, description, children,
}: { eyebrow?: string; title: string; description: string; children?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow ?? "پٹرولیم ڈپو"} <span>/</span> {title}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}

export function EmptyState({ icon = "search", title, hint, action }: { icon?: string; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  );
}

export function LoadingState({ label = "لوڈ ہو رہا ہے…" }: { label?: string }) {
  return <div className="empty"><span className="spinner" /><h3>{label}</h3></div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty">
      <Icon name="alert" size={28} />
      <h3>ڈیٹا لوڈ نہیں ہو سکا</h3>
      <p>{message}</p>
      {onRetry && <Button onClick={onRetry}>دوبارہ کوشش</Button>}
    </div>
  );
}

export function Field({ label, children, full = false }: { label: string; children: ReactNode; full?: boolean }) {
  return <label className={full ? "full" : ""}><span>{label}</span>{children}</label>;
}

export function StatusBadge({ status }: { status?: string }) {
  const s = status ?? "pending";
  const tone: Tone = s === "paid" || s === "synced" ? "success"
    : s === "partial" || s === "pending" || s === "conflict" ? "warning"
    : s === "failed" || s === "unpaid" ? "danger"
    : s === "posted" ? "info" : "neutral";
  const label: Record<string, string> = {
    paid: "ادا شدہ", synced: "سنک شدہ", partial: "جزوی", pending: "زیرِ التوا",
    conflict: "تنازع", failed: "ناکام", unpaid: "غیر ادا شدہ", posted: "درج",
    cash: "نقد", credit: "ادھار", reversed: "منسوخ",
  };
  return <Badge tone={tone}>{label[s] ?? s}</Badge>;
}

// ---------------------------------------------------------------- toasts

interface Toast { id: number; message: string; tone: Tone }
const ToastCtx = createContext<(message: string, tone?: Tone) => void>(() => {});
export function useToast() { return useContext(ToastCtx); }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Tone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-stack">
        {toasts.map((tt) => (
          <div className={`toast toast-${tt.tone}`} key={tt.id}>
            <span><Icon name={tt.tone === "danger" ? "alert" : "check"} /></span>
            <strong>{tt.message}</strong>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------------------------------------------------------- modal

export function Modal({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div><h2>{title}</h2></div>
          <button className="close" onClick={onClose} aria-label="بند کریں">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
