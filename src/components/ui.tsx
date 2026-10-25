import { createContext, useCallback, useContext, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "./Icons";
import { useLang } from "../lib/lang";
import { statusLabel } from "../lib/labels";

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
  const { t } = useLang();
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow ?? t.fallbackDepot} <span>/</span> {title}</div>
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

export function LoadingState({ label }: { label?: string }) {
  const { t } = useLang();
  return <div className="empty"><span className="spinner" /><h3>{label ?? t.loading}</h3></div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useLang();
  return (
    <div className="empty">
      <Icon name="alert" size={28} />
      <h3>{t.errorLoading}</h3>
      <p>{message}</p>
      {onRetry && <Button onClick={onRetry}>{t.retry}</Button>}
    </div>
  );
}

export function Field({ label, children, full = false }: { label: string; children: ReactNode; full?: boolean }) {
  return <label className={full ? "full" : ""}><span>{label}</span>{children}</label>;
}

export function StatusBadge({ status }: { status?: string }) {
  const { t } = useLang();
  const s = status ?? "pending";
  const tone: Tone = s === "paid" || s === "synced" || s === "active" ? "success"
    : s === "partial" || s === "pending" || s === "conflict" || s === "syncing" ? "warning"
    : s === "failed" || s === "unpaid" || s === "reversed" ? "danger"
    : s === "posted" || s === "in" ? "info" : "neutral";
  return <Badge tone={tone}>{statusLabel(s, t)}</Badge>;
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
  const { t } = useLang();
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div><h2>{title}</h2></div>
          <button className="close" onClick={onClose} aria-label={t.close}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
