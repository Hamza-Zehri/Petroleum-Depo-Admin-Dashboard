// Firestore data-access layer + shared accounting derivations.
//
// Everything here mirrors the phone app's rules so a figure shown on the web
// dashboard equals the figure the phone computes from the same documents:
//   book stock   = opening + in − out ± adjust
//   customer due = opening + Σ sale.due_amount − Σ customer_payments
//   supplier due = opening + Σ purchase.total − Σ supplier_payments
//   cash balance = Σ cashbook.in(cash) − Σ cashbook.out(cash)
// COGS per litre uses weighted-average inventory cost (scale 4).
import { useEffect, useMemo, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, getDocs, increment, limit as qLimit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where, writeBatch, type QueryConstraint,
} from "firebase/firestore";
import { db } from "./firebase";
import { COLLECTIONS, type Role } from "./types";
import { D } from "./format";
import Decimal from "decimal.js";

export type DocData = Record<string, unknown> & { id?: string };

/**
 * The device id stamped on every record written from this dashboard. The phone
 * uses the same `device_id` field, so the admin's writes are clearly
 * attributable and are picked up by the `updated_at > last_sync_at` pull.
 */
export const ADMIN_DEVICE_ID = "ADMIN";

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export function refNo(prefix: string): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${yy}${mm}-${rnd}`;
}

// --------------------------------------------------------------- live reads

export interface UseCollectionResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
}

export function useCollection<T extends DocData = DocData>(
  name: string,
  constraints: QueryConstraint[] = [],
  deps: unknown[] = [],
): UseCollectionResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, name), ...constraints);
    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as unknown as T)));
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, ...deps]);

  return { data, loading, error };
}

export function useCollectionOrdered<T extends DocData = DocData>(
  name: string,
  orderField = "created_at",
  dir: "asc" | "desc" = "desc",
): UseCollectionResult<T> {
  return useCollection<T>(name, [orderBy(orderField, dir)], [name, orderField, dir]);
}

/** Ordered by a date field that may be absent on legacy records. */
export function byDateDesc<T extends DocData>(rows: T[], field: string): T[] {
  return [...rows].sort((a, b) => String(b[field] ?? "").localeCompare(String(a[field] ?? "")));
}

// -------------------------------------------------------------- writes

export interface NewRecordMeta {
  createdBy?: string;
  deviceId?: string;
}

/** Create or overwrite a record with phone-compatible sync metadata. */
export async function putRecord(
  name: string,
  id: string,
  data: DocData,
  meta: NewRecordMeta = {},
): Promise<void> {
  const now = new Date().toISOString();
  await setDoc(
    doc(db, name, id),
    {
      ...data,
      id,
      updated_at: now,
      // camelCase aliases kept in sync for older clients that query `updatedAt`.
      updatedAt: now,
      created_at: (data.created_at as string) ?? now,
      version: increment(1),
      sync_status: (data.sync_status as string) ?? "synced",
      created_by: (data.created_by as string) ?? meta.createdBy ?? "ADMIN",
      device_id: (data.device_id as string) ?? meta.deviceId ?? ADMIN_DEVICE_ID,
      deviceId: (data.deviceId as string) ?? meta.deviceId ?? ADMIN_DEVICE_ID,
      _updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function createRecord(
  name: string,
  data: DocData,
  meta: NewRecordMeta = {},
): Promise<string> {
  const id = (data.id as string) || newId();
  const now = new Date().toISOString();
  await setDoc(doc(db, name, id), {
    ...data,
    id,
    created_at: now,
    updated_at: now,
    updatedAt: now,
    version: 1,
    sync_status: "synced",
    created_by: (data.created_by as string) ?? meta.createdBy ?? "ADMIN",
    device_id: (data.device_id as string) ?? meta.deviceId ?? ADMIN_DEVICE_ID,
    deviceId: (data.deviceId as string) ?? meta.deviceId ?? ADMIN_DEVICE_ID,
    _updatedAt: serverTimestamp(),
  });
  return id;
}

/**
 * Bulk-create records in Firestore batches (max 400 docs per commit). Every
 * document gets the same sync metadata as a single create, so the Android app
 * downloads the whole import on its next pull.
 */
export async function createRecordsBatch(
  name: string,
  rows: DocData[],
  meta: NewRecordMeta = {},
): Promise<number> {
  let created = 0;
  for (let i = 0; i < rows.length; i += 400) {
    const now = new Date().toISOString();
    const batch = writeBatch(db);
    for (const data of rows.slice(i, i + 400)) {
      const id = (data.id as string) || newId();
      batch.set(doc(db, name, id), {
        ...data,
        id,
        created_at: now,
        updated_at: now,
        updatedAt: now,
        version: 1,
        sync_status: "synced",
        created_by: (data.created_by as string) ?? meta.createdBy ?? "ADMIN",
        device_id: (data.device_id as string) ?? meta.deviceId ?? ADMIN_DEVICE_ID,
        deviceId: (data.deviceId as string) ?? meta.deviceId ?? ADMIN_DEVICE_ID,
        _updatedAt: serverTimestamp(),
      });
      created++;
    }
    await batch.commit();
  }
  return created;
}

export async function patchRecord(name: string, id: string, patch: DocData): Promise<void> {
  const now = new Date().toISOString();
  await updateDoc(doc(db, name, id), {
    ...patch,
    updated_at: now,
    updatedAt: now,
    device_id: (patch.device_id as string) ?? ADMIN_DEVICE_ID,
    deviceId: (patch.deviceId as string) ?? ADMIN_DEVICE_ID,
    // Bump the version so the phone accepts this revision during its pull.
    version: increment(1),
    _updatedAt: serverTimestamp(),
  });
}

export async function deleteRecord(name: string, id: string): Promise<void> {
  await deleteDoc(doc(db, name, id));
}

/** Soft-delete for master data (customers/suppliers/tanks/vehicles/users). */
export async function setActive(name: string, id: string, active: boolean): Promise<void> {
  await patchRecord(name, id, { active });
}

export function useDoc<T extends DocData = DocData>(name: string, id: string | null): { data: T | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!id) { setData(null); setLoading(false); return; }
    setLoading(true);
    return onSnapshot(doc(db, name, id), (snap) => {
      setData(snap.exists() ? ({ id: snap.id, ...snap.data() } as unknown as T) : null);
      setLoading(false);
    }, () => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, id]);
  return { data, loading };
}

export async function logAudit(entry: {
  user_id: string;
  device_id?: string;
  action: string;
  entity: string;
  entity_id: string;
  before?: unknown;
  after?: unknown;
  business_date: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const deviceId = entry.device_id ?? ADMIN_DEVICE_ID;
  await addDoc(collection(db, COLLECTIONS.auditLogs), {
    id: newId(),
    event_time: now,
    business_date: entry.business_date,
    user_id: entry.user_id,
    device_id: deviceId,
    deviceId,
    updated_at: now,
    updatedAt: now,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entity_id,
    before_json: entry.before ? JSON.stringify(entry.before) : null,
    after_json: entry.after ? JSON.stringify(entry.after) : null,
    version: 1,
    sync_status: "synced",
    _updatedAt: serverTimestamp(),
  });
}

// ------------------------------------------------------- settings (key/value)

export async function getSettingsMap(): Promise<Record<string, string>> {
  const snap = await getDocs(collection(db, COLLECTIONS.settings));
  const out: Record<string, string> = {};
  snap.forEach((d) => {
    const v = (d.data() as { value?: unknown }).value;
    out[d.id] = v == null ? "" : String(v);
  });
  return out;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await setDoc(doc(db, COLLECTIONS.settings, key), { id: key, value }, { merge: true });
}

export function useSettings(): { settings: Record<string, string>; loading: boolean; error: string | null } {
  const { data, loading, error } = useCollection<{ id: string; value: string }>(COLLECTIONS.settings);
  const settings = useMemo(() => {
    const out: Record<string, string> = {};
    for (const s of data) out[s.id] = s.value == null ? "" : String(s.value);
    return out;
  }, [data]);
  return { settings, loading, error };
}

// --------------------------------------------------- shared accounting math

export function sum(rows: unknown[], field: string): Decimal {
  return rows.reduce<Decimal>((acc, r) => acc.plus(D((r as DocData)[field] as string)), new Decimal(0));
}

export interface TankStock {
  tankId: string;
  fuel: string;
  name: string;
  opening: Decimal;
  received: Decimal;
  dispatched: Decimal;
  adjusted: Decimal;
  book: Decimal;
}

/** Book stock per tank from the ledger (opening + in − out ± adjust). */
export function computeTankStocks(tanks: DocData[], ledger: DocData[]): TankStock[] {
  return tanks.map((tk) => {
    const id = String(tk.id);
    const rows = ledger.filter((l) => String(l.tank_id) === id && String(l.ref_type) !== "opening");
    const opening = D(tk.opening_stock as string);
    let received = new Decimal(0);
    let dispatched = new Decimal(0);
    let adjusted = new Decimal(0);
    for (const r of rows) {
      const q = D(r.quantity as string);
      const mv = String(r.movement);
      if (mv === "in") received = received.plus(q);
      else if (mv === "out") dispatched = dispatched.plus(q);
      else adjusted = adjusted.plus(q);
    }
    const book = opening.plus(received).minus(dispatched).plus(adjusted);
    return {
      tankId: id,
      fuel: String(tk.fuel_type ?? ""),
      name: String(tk.name ?? ""),
      opening, received, dispatched, adjusted, book,
    };
  });
}

export function fuelStock(stocks: TankStock[], fuel: string): Decimal {
  return stocks
    .filter((s) => s.fuel === fuel)
    .reduce<Decimal>((a, s) => a.plus(s.book), new Decimal(0));
}

export function fuelCapacity(tanks: DocData[], fuel: string): Decimal {
  return tanks
    .filter((t) => String(t.fuel_type) === fuel && isActive(t.active))
    .reduce<Decimal>((a, t) => a.plus(D(t.capacity as string)), new Decimal(0));
}

export function isActive(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === undefined || v === null;
}

/** Weighted-average inventory cost per litre for a fuel (scale 4). */
export function weightedAvgCost(fuel: string, purchases: DocData[], sales: DocData[]): Decimal {
  const fuelPurchases = purchases.filter((p) => String(p.fuel_type) === fuel);
  const fuelSales = sales.filter((s) => String(s.fuel_type) === fuel);
  const bought = fuelPurchases.reduce<Decimal>((a, p) => a.plus(D(p.accepted_qty as string)), new Decimal(0));
  const boughtCost = fuelPurchases.reduce<Decimal>(
    (a, p) => a.plus(D(p.total_amount as string)),
    new Decimal(0),
  );
  const sold = fuelSales.reduce<Decimal>((a, s) => a.plus(D(s.quantity as string)), new Decimal(0));
  // Remaining litres carry the average of what was bought and not yet sold.
  const denom = bought.minus(sold);
  if (denom.lte(0) || bought.lte(0)) {
    return bought.lte(0) ? new Decimal(0) : boughtCost.div(bought).toDecimalPlaces(4);
  }
  return boughtCost.div(bought).toDecimalPlaces(4);
}

export interface CustomerBalance {
  customerId: string;
  opening: Decimal;
  invoiced: Decimal;
  paid: Decimal;
  due: Decimal;
}

export function computeCustomerBalances(
  customers: DocData[], sales: DocData[], payments: DocData[],
): CustomerBalance[] {
  return customers.map((c) => {
    const id = String(c.id);
    const opening = D(c.opening_balance as string);
    const invoiced = sum(sales.filter((s) => String(s.customer_id) === id && String(s.status ?? "posted") === "posted"), "due_amount");
    const paid = sum(payments.filter((p) => String(p.customer_id) === id), "amount");
    return { customerId: id, opening, invoiced, paid, due: opening.plus(invoiced).minus(paid) };
  });
}

export interface SupplierBalance {
  supplierId: string;
  opening: Decimal;
  purchases: Decimal;
  paid: Decimal;
  due: Decimal;
}

export function computeSupplierBalances(
  suppliers: DocData[], purchases: DocData[], payments: DocData[],
): SupplierBalance[] {
  return suppliers.map((s) => {
    const id = String(s.id);
    const opening = D(s.opening_balance as string);
    const bought = sum(purchases.filter((p) => String(p.supplier_id) === id && String(p.status ?? "posted") === "posted"), "total_amount");
    const paid = sum(payments.filter((p) => String(p.supplier_id) === id), "amount");
    return { supplierId: id, opening, purchases: bought, paid, due: opening.plus(bought).minus(paid) };
  });
}

export function cashBalance(cashbook: DocData[], method?: string): Decimal {
  let bal = new Decimal(0);
  for (const c of cashbook) {
    if (method && String(c.method) !== method) continue;
    const amt = D(c.amount as string);
    bal = String(c.dir) === "in" ? bal.plus(amt) : bal.minus(amt);
  }
  return bal;
}

export function withinPeriod(dateStr: string | undefined, from: string, to: string): boolean {
  const d = (dateStr ?? "").slice(0, 10);
  return d >= from && d <= to;
}
