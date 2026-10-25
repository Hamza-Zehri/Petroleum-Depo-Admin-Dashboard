// Shared data model. These types mirror the Android app's SQLite schema 1:1
// (same collection names, same snake_case field names) so a record created on
// the phone and a record shown here are the exact same document in Firestore.
//
// Money and quantity fields are stored as exact-decimal TEXT, never as JS
// floats, so accounting never drifts through binary rounding.

export type FuelType = "petrol" | "diesel";
export type SalePaymentType = "cash" | "credit" | "partial";
export type CashDir = "in" | "out";
export type Movement = "in" | "out" | "adjust";
export type StockRefType = "purchase" | "sale" | "adjustment" | "opening" | "dip";
export type SyncStatus = "pending" | "syncing" | "synced" | "failed" | "conflict";
export type TxStatus = "posted" | "reversed";

export type Role = "owner" | "manager" | "accountant" | "operator";

// Permission set — identical to the phone app's `Perm` enum.
export type Perm =
  | "receiveFuel"
  | "loadFuel"
  | "receivePayment"
  | "paySupplier"
  | "addExpense"
  | "changeRates"
  | "stockAdjust"
  | "reverseTransaction"
  | "viewFinancialReports"
  | "closeDay"
  | "manageUsers"
  | "manageTanks"
  | "manageMasterData"
  | "exportBackup"
  | "viewAudit";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  accountant: "Accountant",
  operator: "Operator",
};

const ROLE_PERMS: Record<Role, Perm[]> = {
  owner: [
    "receiveFuel", "loadFuel", "receivePayment", "paySupplier", "addExpense",
    "changeRates", "stockAdjust", "reverseTransaction", "viewFinancialReports",
    "closeDay", "manageUsers", "manageTanks", "manageMasterData", "exportBackup", "viewAudit",
  ],
  manager: [
    "receiveFuel", "loadFuel", "receivePayment", "paySupplier", "addExpense",
    "changeRates", "stockAdjust", "viewFinancialReports", "closeDay",
    "manageTanks", "manageMasterData", "viewAudit",
  ],
  accountant: [
    "receivePayment", "paySupplier", "addExpense", "viewFinancialReports", "exportBackup", "viewAudit",
  ],
  operator: ["receiveFuel", "loadFuel", "receivePayment", "addExpense"],
};

export function can(role: Role | undefined | null, perm: Perm): boolean {
  if (!role) return false;
  return ROLE_PERMS[role]?.includes(perm) ?? false;
}

export interface BaseDoc {
  id: string;
  version: number;
  sync_status: SyncStatus;
  created_at?: string;
  updated_at?: string;
}

export interface User extends BaseDoc {
  username: string;
  full_name: string;
  role: Role;
  active: boolean | number;
  last_login?: string;
  device_id?: string;
}

export interface Customer extends BaseDoc {
  name: string;
  contact?: string | null;
  address?: string | null;
  company?: string | null;
  opening_balance: string;
  credit_limit?: string | null;
  active: boolean | number;
}

export interface Supplier extends BaseDoc {
  name: string;
  contact?: string | null;
  address?: string | null;
  company?: string | null;
  opening_balance: string;
  active: boolean | number;
}

export interface Tank extends BaseDoc {
  name: string;
  fuel_type: FuelType;
  capacity: string;
  opening_stock: string;
  active: boolean | number;
}

export interface Vehicle {
  id: string;
  customer_id: string;
  reg_no: string;
  model?: string | null;
  driver?: string | null;
  active?: boolean | number;
}

export interface Purchase extends BaseDoc {
  ref_no: string;
  supplier_id: string;
  vehicle_no: string;
  fuel_type: FuelType;
  tank_id: string;
  delivered_qty: string;
  accepted_qty: string;
  rate: string;
  additional_charges: string;
  discount: string;
  invoice_ref?: string | null;
  total_amount: string;
  paid_now: string;
  payment_status: "unpaid" | "partial" | "paid";
  business_date: string;
  created_by: string;
  device_id: string;
  idempotency_key: string;
  status: TxStatus;
}

export interface Sale extends BaseDoc {
  ref_no: string;
  customer_id: string;
  vehicle_no: string;
  driver_name?: string | null;
  fuel_type: FuelType;
  tank_id: string;
  quantity: string;
  rate: string;
  additional_charges: string;
  discount: string;
  total_amount: string;
  amount_received: string;
  due_amount: string;
  payment_type: SalePaymentType;
  cost_per_liter: string;
  cost_of_goods: string;
  gross_profit: string;
  business_date: string;
  created_by: string;
  device_id: string;
  idempotency_key: string;
  status: TxStatus;
}

export interface CustomerPayment extends BaseDoc {
  ref_no: string;
  customer_id: string;
  amount: string;
  method: string;
  reference_no?: string | null;
  notes?: string | null;
  business_date: string;
  created_by: string;
  device_id: string;
  idempotency_key: string;
  status: TxStatus;
}

export interface SupplierPayment extends BaseDoc {
  ref_no: string;
  supplier_id: string;
  amount: string;
  method: string;
  reference_no?: string | null;
  notes?: string | null;
  business_date: string;
  created_by: string;
  device_id: string;
  idempotency_key: string;
  status: TxStatus;
}

export interface Expense extends BaseDoc {
  ref_no: string;
  category: string;
  amount: string;
  expense_date: string;
  description?: string | null;
  method: string;
  reference_no?: string | null;
  created_by: string;
  device_id: string;
  idempotency_key: string;
  status: TxStatus;
}

export interface CashEntry extends BaseDoc {
  ref_no: string;
  entry_date: string;
  business_date: string;
  dir: CashDir;
  category: string;
  amount: string;
  method: string;
  description?: string | null;
  related_table?: string | null;
  related_id?: string | null;
  created_by: string;
  device_id: string;
}

export interface StockLedgerEntry extends BaseDoc {
  entry_time: string;
  business_date: string;
  tank_id: string;
  fuel_type: FuelType;
  movement: Movement;
  quantity: string;
  balance_after: string;
  ref_type: StockRefType;
  ref_id: string;
  notes?: string | null;
  created_by: string;
  device_id: string;
}

export interface TankDip extends BaseDoc {
  tank_id: string;
  measured_qty: string;
  book_qty: string;
  variance: string;
  measured_at: string;
  measured_by: string;
  notes?: string | null;
}

export interface StockAdjustment extends BaseDoc {
  tank_id: string;
  adjustment_qty: string;
  reason: string;
  authorized_by: string;
  business_date: string;
}

export interface DailyClosing extends BaseDoc {
  business_date: string;
  opened_at: string;
  closed_at: string;
  operator_id: string;
  opening_cash: string;
  cash_sales: string;
  customer_collections: string;
  supplier_payments: string;
  expenses: string;
  other_in: string;
  other_out: string;
  expected_cash: string;
  actual_cash: string;
  difference: string;
  petrol_stock: string;
  diesel_stock: string;
  pending_count: number;
}

export interface AuditLog {
  id: string;
  event_time: string;
  business_date: string;
  user_id: string;
  device_id: string;
  action: string;
  entity: string;
  entity_id: string;
  before_json?: string | null;
  after_json?: string | null;
  version: number;
  sync_status: SyncStatus;
}

export interface DeviceRec {
  id: string;
  name: string;
  role: Role;
  registered_at: string;
  last_seen?: string | null;
}

export interface Setting {
  id: string; // the setting key
  value: string;
}

// Firestore collection names (identical on both platforms).
export const COLLECTIONS = {
  users: "users",
  customers: "customers",
  suppliers: "suppliers",
  tanks: "tanks",
  vehicles: "vehicles",
  purchases: "purchases",
  sales: "sales",
  customerPayments: "customer_payments",
  supplierPayments: "supplier_payments",
  expenses: "expenses",
  cashbook: "cashbook",
  stockLedger: "stock_ledger",
  tankDips: "tank_dips",
  stockAdjustments: "stock_adjustments",
  dailyClosings: "daily_closings",
  auditLogs: "audit_logs",
  receipts: "receipts",
  devices: "devices",
  settings: "settings",
} as const;
