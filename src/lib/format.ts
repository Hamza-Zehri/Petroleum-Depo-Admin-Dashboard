// Exact-decimal money / quantity helpers + Urdu-aware formatting.
import Decimal from "decimal.js";

// Match the phone app: money is scaled to 2 decimals, quantities shown as-is,
// inventory cost is scaled to 4 decimals (weighted-average cost per litre).
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Num = Decimal;

export const D = (v: string | number | Decimal | null | undefined): Decimal => {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  try {
    return new Decimal(v as Decimal.Value);
  } catch {
    return new Decimal(0);
  }
};

export const ZERO = new Decimal(0);

export function money(v: string | number | Decimal, currency = "Rs"): string {
  const d = D(v);
  return `${currency} ${d.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export function moneyShort(v: string | number | Decimal, currency = "Rs"): string {
  const d = D(v);
  const abs = d.abs();
  const sign = d.isNegative() ? "-" : "";
  if (abs.gte(1_00_00_000)) return `${sign}${currency} ${abs.div(1_00_00_000).toFixed(2)} crore`;
  if (abs.gte(1_00_000)) return `${sign}${currency} ${abs.div(1_00_000).toFixed(2)} lac`;
  return `${sign}${money(abs, currency)}`;
}

export function qty(v: string | number | Decimal): string {
  const d = D(v);
  const s = d.toFixed(2).replace(/\.?0+$/, "");
  return `${s.replace(/\B(?=(\d{3})+(?!\d))/g, ",")} L`;
}

export function litres(v: string | number | Decimal): string {
  const d = D(v);
  return `${d.toFixed(2).replace(/\.?0+$/, "")} L`;
}

export function num(v: string | number | Decimal, dp = 0): string {
  return D(v).toFixed(dp);
}

export function percent(part: string | number | Decimal, whole: string | number | Decimal, dp = 1): number {
  const w = D(whole);
  if (w.lte(0)) return 0;
  return D(part).div(w).mul(100).toNumber() == null ? 0 : Number(D(part).div(w).mul(100).toFixed(dp));
}

export function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

// ---- dates -------------------------------------------------------------

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isoDate(d: Date | string | number): string {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d ?? "");
  return dt.toISOString().slice(0, 10);
}

/** Business date honouring the configurable start hour (e.g. 6am shift start). */
export function businessDate(startHour = 6, at: Date = new Date()): string {
  const d = new Date(at.getTime());
  if (d.getHours() < startHour) d.setDate(d.getDate() - 1);
  return isoDate(d);
}

export function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return v;
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(v?: string | null): string {
  if (!v) return "—";
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return v;
  return dt.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function fmtTime(v?: string | null): string {
  if (!v) return "—";
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return v;
  return dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Whole-number money for compact table cells (rupees, no decimals). */
export function moneyCompact(v: string | number | Decimal, currency = "Rs"): string {
  const d = D(v);
  return `${currency} ${d.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
