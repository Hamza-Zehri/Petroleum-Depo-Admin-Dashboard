// Language-aware labels for data values that stay stored in a stable,
// canonical form (Urdu category names, English role/method codes, etc.).
//
// Display through these helpers instead of printing raw stored values, so the
// English UI never leaks an Urdu label and the Urdu UI stays consistent.
import type { Dict } from "./i18n";
import type { Perm, Role } from "./types";

type CategoryKey = keyof Dict["categories"];
type StatusKey = keyof Dict["status"];

export interface ExpenseCategoryOption {
  /** Stored value kept for compatibility with the phone app and older records. */
  value: string;
  key: CategoryKey;
}

export const EXPENSE_CATEGORY_OPTIONS: ExpenseCategoryOption[] = [
  { value: "تنخواہ", key: "salary" },
  { value: "کرایہ", key: "rent" },
  { value: "بجلی", key: "electricity" },
  { value: "پانی", key: "water" },
  { value: "مرمت", key: "repair" },
  { value: "ٹرانسپورٹ", key: "transport" },
  { value: "اسٹیشنری", key: "stationery" },
  { value: "چائے پانی", key: "tea" },
  { value: "دیگر", key: "other" },
];

const CATEGORY_BY_VALUE: Record<string, CategoryKey> = Object.fromEntries(
  EXPENSE_CATEGORY_OPTIONS.map((o) => [o.value, o.key]),
);

const CATEGORY_BY_KEY: Record<string, CategoryKey> = Object.fromEntries(
  EXPENSE_CATEGORY_OPTIONS.map((o) => [o.key, o.key]),
);

export function categoryKey(value: string): CategoryKey {
  return CATEGORY_BY_VALUE[value] ?? CATEGORY_BY_KEY[value] ?? "other";
}

export function categoryLabel(value: string | undefined, t: Dict): string {
  if (!value) return t.categories.other;
  return t.categories[categoryKey(value)];
}

export function roleLabel(role: string | undefined, t: Dict): string {
  if (!role) return "";
  return t.roles[role as Role] ?? role;
}

export function statusLabel(status: string | undefined, t: Dict): string {
  if (!status) return t.status.pending;
  return t.status[status as StatusKey] ?? status;
}

export function methodLabel(method: string | undefined, t: Dict): string {
  if (!method) return "";
  const key = method.toLowerCase();
  if (key === "cash" || key === "bank" || key === "other") return t.methods[key];
  return method;
}

export function dirLabel(dir: string | undefined, t: Dict): string {
  if (dir === "in") return t.dirs.in;
  if (dir === "out") return t.dirs.out;
  return dir ?? "";
}

export function fuelLabel(fuel: string | undefined, t: Dict): string {
  const key = String(fuel ?? "").toLowerCase();
  if (key === "diesel") return t.diesel;
  if (key === "petrol") return t.petrol;
  return fuel ?? "";
}

const CASH_CATEGORY_KEYS: Record<string, keyof Dict["cashCategories"]> = {
  manual: "manual",
  sale: "sale",
  purchase: "purchase",
  expense: "expense",
  customer_payment: "customerPayment",
  customerPayment: "customerPayment",
  supplier_payment: "supplierPayment",
  supplierPayment: "supplierPayment",
  reversal: "reversal",
  other: "other",
};

export function cashCategoryLabel(value: string | undefined, t: Dict): string {
  const key = CASH_CATEGORY_KEYS[String(value ?? "")];
  return key ? t.cashCategories[key] : String(value ?? "");
}

export function permLabel(perm: Perm | string, t: Dict): string {
  return t.perms[perm as Perm] ?? String(perm);
}

/** Seeded/default depot names are translated; user-entered names are preserved. */
export function depotDisplayName(name: string | undefined, t: Dict): string {
  const value = String(name ?? "").trim();
  if (!value || value === "پٹرولیم ڈپو" || value === "Petroleum Depot") return t.fallbackDepot;
  return value;
}

/** Seeded owner names are translated; real names are preserved. */
export function ownerDisplayName(name: string | undefined, t: Dict): string {
  const value = String(name ?? "").trim();
  if (!value || value === "ڈپو مالک" || value === "مالک" || value === "Depot Owner") return t.ownerName;
  return value;
}
