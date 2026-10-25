// Transaction posting. Each business action is written as one atomic batch so
// the transaction, the stock ledger and the cash book can never disagree.
//
// Mirrors the phone app's rules:
//   • sale       → stock_ledger(out) + cashbook(in, amount_received) + COGS snapshot
//   • purchase   → stock_ledger(in)  + cashbook(out, paid_now) + supplier_payment(paid_now)
//   • payment    → customer_payment / supplier_payment + cashbook
//   • expense    → expenses + cashbook(out)
// Payables use Σ supplier_payments, so a purchase paid at delivery also records
// a supplier_payment for paid_now (keeps both balances and cash correct).
import { collection, doc, getDocs, increment, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { COLLECTIONS } from "./types";
import { ADMIN_DEVICE_ID, newId, refNo } from "./repo";
import { currentT } from "./lang";
import { D, businessDate } from "./format";
import Decimal from "decimal.js";

interface Common {
  actor: string;
  deviceId?: string;
  startHour?: number;
}

function meta(extra: Record<string, unknown>, c: Common) {
  const now = new Date().toISOString();
  const deviceId = c.deviceId ?? ADMIN_DEVICE_ID;
  return {
    version: 1,
    sync_status: "synced",
    created_at: now,
    updated_at: now,
    updatedAt: now,
    created_by: c.actor,
    device_id: deviceId,
    deviceId,
    _updatedAt: serverTimestamp(),
    ...extra,
  };
}

function cashEntry(
  c: Common, dir: "in" | "out", method: string, category: string, amount: Decimal,
  relatedTable: string, relatedId: string, bd: string, refPrefix: string,
) {
  const now = new Date().toISOString();
  const deviceId = c.deviceId ?? ADMIN_DEVICE_ID;
  return {
    id: newId(),
    ref_no: refNo(refPrefix),
    entry_date: now,
    business_date: bd,
    dir,
    category,
    amount: amount.toFixed(2),
    method,
    description: null,
    related_table: relatedTable,
    related_id: relatedId,
    created_by: c.actor,
    device_id: deviceId,
    deviceId,
    version: 1,
    sync_status: "synced",
    created_at: now,
    updated_at: now,
    updatedAt: now,
    _updatedAt: serverTimestamp(),
  };
}

export interface PostSaleInput extends Common {
  customer_id: string;
  vehicle_no: string;
  driver_name?: string;
  fuel_type: string;
  tank_id: string;
  quantity: string;
  rate: string;
  additional_charges: string;
  discount: string;
  amount_received: string;
  payment_type: "cash" | "credit" | "partial";
  cost_per_liter: string;
  business_date?: string;
}

export async function postSale(input: PostSaleInput): Promise<{ id: string; refNo: string }> {
  const qty = D(input.quantity);
  const rate = D(input.rate);
  const total = qty.mul(rate).plus(D(input.additional_charges)).minus(D(input.discount));
  const received = D(input.amount_received);
  const due = Decimal.max(total.minus(received), D(0));
  const cost = D(input.cost_per_liter);
  const cogs = qty.mul(cost);
  const gross = total.minus(cogs);
  const bd = input.business_date || businessDate(input.startHour ?? 6);
  const id = newId();
  const ref = refNo("SAL");
  const batch = writeBatch(db);

  batch.set(doc(db, COLLECTIONS.sales, id), meta({
    id, ref_no: ref, customer_id: input.customer_id, vehicle_no: input.vehicle_no,
    driver_name: input.driver_name ?? null, fuel_type: input.fuel_type, tank_id: input.tank_id,
    quantity: qty.toFixed(3), rate: rate.toFixed(4), additional_charges: D(input.additional_charges).toFixed(2),
    discount: D(input.discount).toFixed(2), total_amount: total.toFixed(2),
    amount_received: received.toFixed(2), due_amount: due.toFixed(2),
    payment_type: input.payment_type, cost_per_liter: cost.toFixed(4), cost_of_goods: cogs.toFixed(2),
    gross_profit: gross.toFixed(2), business_date: bd, idempotency_key: id, status: "posted",
  }, input));

  const ledgerId = newId();
  batch.set(doc(db, COLLECTIONS.stockLedger, ledgerId), meta({
    id: ledgerId, entry_time: new Date().toISOString(), business_date: bd, tank_id: input.tank_id,
    fuel_type: input.fuel_type, movement: "out", quantity: qty.toFixed(3), balance_after: "",
    ref_type: "sale", ref_id: id, notes: null,
  }, input));

  if (received.gt(0)) {
    const ce = cashEntry(input, "in", input.payment_type === "credit" ? "other" : "cash",
      "sale", received, "sales", id, bd, "RCP");
    batch.set(doc(db, COLLECTIONS.cashbook, ce.id), ce);
  }

  await batch.commit();
  return { id, refNo: ref };
}

export interface PostPurchaseInput extends Common {
  supplier_id: string;
  vehicle_no: string;
  fuel_type: string;
  tank_id: string;
  delivered_qty: string;
  accepted_qty: string;
  rate: string;
  additional_charges: string;
  discount: string;
  invoice_ref?: string;
  paid_now: string;
  payment_method: string;
  business_date?: string;
}

export async function postPurchase(input: PostPurchaseInput): Promise<{ id: string; refNo: string }> {
  const accepted = D(input.accepted_qty);
  const rate = D(input.rate);
  const total = accepted.mul(rate).plus(D(input.additional_charges)).minus(D(input.discount));
  const paid = D(input.paid_now);
  const status = paid.lte(0) ? "unpaid" : paid.gte(total) ? "paid" : "partial";
  const bd = input.business_date || businessDate(input.startHour ?? 6);
  const id = newId();
  const ref = refNo("PUR");
  const batch = writeBatch(db);

  batch.set(doc(db, COLLECTIONS.purchases, id), meta({
    id, ref_no: ref, supplier_id: input.supplier_id, vehicle_no: input.vehicle_no,
    fuel_type: input.fuel_type, tank_id: input.tank_id, delivered_qty: D(input.delivered_qty).toFixed(3),
    accepted_qty: accepted.toFixed(3), rate: rate.toFixed(4),
    additional_charges: D(input.additional_charges).toFixed(2), discount: D(input.discount).toFixed(2),
    invoice_ref: input.invoice_ref ?? null, total_amount: total.toFixed(2),
    paid_now: paid.toFixed(2), payment_status: status, business_date: bd,
    idempotency_key: id, status: "posted",
  }, input));

  const ledgerId = newId();
  batch.set(doc(db, COLLECTIONS.stockLedger, ledgerId), meta({
    id: ledgerId, entry_time: new Date().toISOString(), business_date: bd, tank_id: input.tank_id,
    fuel_type: input.fuel_type, movement: "in", quantity: accepted.toFixed(3), balance_after: "",
    ref_type: "purchase", ref_id: id, notes: null,
  }, input));

  if (paid.gt(0)) {
    const pid = newId();
    batch.set(doc(db, COLLECTIONS.supplierPayments, pid), meta({
      id: pid, ref_no: refNo("SPY"), supplier_id: input.supplier_id, amount: paid.toFixed(2),
      method: input.payment_method, reference_no: ref, notes: currentT().paymentAtPurchase,
      business_date: bd, idempotency_key: pid, status: "posted",
    }, input));
    const ce = cashEntry(input, "out", input.payment_method, "purchase", paid, "purchases", id, bd, "PAY");
    batch.set(doc(db, COLLECTIONS.cashbook, ce.id), ce);
  }

  await batch.commit();
  return { id, refNo: ref };
}

export interface PostCustomerPaymentInput extends Common {
  customer_id: string;
  amount: string;
  method: string;
  reference_no?: string;
  notes?: string;
  business_date?: string;
}

export async function postCustomerPayment(input: PostCustomerPaymentInput): Promise<{ refNo: string }> {
  const amt = D(input.amount);
  const bd = input.business_date || businessDate(input.startHour ?? 6);
  const id = newId();
  const ref = refNo("CPY");
  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTIONS.customerPayments, id), meta({
    id, ref_no: ref, customer_id: input.customer_id, amount: amt.toFixed(2), method: input.method,
    reference_no: input.reference_no ?? null, notes: input.notes ?? null, business_date: bd,
    idempotency_key: id, status: "posted",
  }, input));
  const ce = cashEntry(input, "in", input.method, "customer_payment", amt, "customer_payments", id, bd, "RCP");
  batch.set(doc(db, COLLECTIONS.cashbook, ce.id), ce);
  await batch.commit();
  return { refNo: ref };
}

export interface PostSupplierPaymentInput extends Common {
  supplier_id: string;
  amount: string;
  method: string;
  reference_no?: string;
  notes?: string;
  business_date?: string;
}

export async function postSupplierPayment(input: PostSupplierPaymentInput): Promise<{ refNo: string }> {
  const amt = D(input.amount);
  const bd = input.business_date || businessDate(input.startHour ?? 6);
  const id = newId();
  const ref = refNo("SPY");
  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTIONS.supplierPayments, id), meta({
    id, ref_no: ref, supplier_id: input.supplier_id, amount: amt.toFixed(2), method: input.method,
    reference_no: input.reference_no ?? null, notes: input.notes ?? null, business_date: bd,
    idempotency_key: id, status: "posted",
  }, input));
  const ce = cashEntry(input, "out", input.method, "supplier_payment", amt, "supplier_payments", id, bd, "PAY");
  batch.set(doc(db, COLLECTIONS.cashbook, ce.id), ce);
  await batch.commit();
  return { refNo: ref };
}

export interface PostExpenseInput extends Common {
  category: string;
  amount: string;
  expense_date: string;
  description?: string;
  method: string;
}

export async function postExpense(input: PostExpenseInput): Promise<{ refNo: string }> {
  const amt = D(input.amount);
  const id = newId();
  const ref = refNo("EXP");
  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTIONS.expenses, id), meta({
    id, ref_no: ref, category: input.category, amount: amt.toFixed(2),
    expense_date: input.expense_date, description: input.description ?? null, method: input.method,
    reference_no: null, idempotency_key: id, status: "posted",
  }, input));
  const ce = cashEntry(input, "out", input.method, "expense", amt, "expenses", id, input.expense_date, "PAY");
  batch.set(doc(db, COLLECTIONS.cashbook, ce.id), ce);
  await batch.commit();
  return { refNo: ref };
}

export interface PostStockAdjustmentInput extends Common {
  tank_id: string;
  fuel_type: string;
  adjustment_qty: string; // signed
  reason: string;
  business_date?: string;
}

export async function postStockAdjustment(input: PostStockAdjustmentInput): Promise<void> {
  const qty = D(input.adjustment_qty);
  const bd = input.business_date || businessDate(input.startHour ?? 6);
  const id = newId();
  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTIONS.stockAdjustments, id), meta({
    id, tank_id: input.tank_id, adjustment_qty: qty.toFixed(3), reason: input.reason,
    authorized_by: input.actor, business_date: bd,
  }, input));
  const ledgerId = newId();
  batch.set(doc(db, COLLECTIONS.stockLedger, ledgerId), meta({
    id: ledgerId, entry_time: new Date().toISOString(), business_date: bd, tank_id: input.tank_id,
    fuel_type: input.fuel_type, movement: "adjust", quantity: qty.toFixed(3), balance_after: "",
    ref_type: "adjustment", ref_id: id, notes: input.reason,
  }, input));
  await batch.commit();
}

export interface PostTankDipInput extends Common {
  tank_id: string;
  measured_qty: string;
  book_qty: string;
  notes?: string;
}

export async function postTankDip(input: PostTankDipInput): Promise<void> {
  const measured = D(input.measured_qty);
  const book = D(input.book_qty);
  const id = newId();
  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTIONS.tankDips, id), meta({
    id, tank_id: input.tank_id, measured_qty: measured.toFixed(3), book_qty: book.toFixed(3),
    variance: measured.minus(book).toFixed(3), measured_at: new Date().toISOString(),
    measured_by: input.actor, notes: input.notes ?? null,
  }, input));
  await batch.commit();
}

export interface ReverseInput extends Common {
  entity: string;          // firestore collection of the transaction
  id: string;
  reason: string;
  business_date?: string;
}

/**
 * Void a posted transaction without mutating history: the original document is
 * flagged `reversed`, and opposite stock-ledger / cash-book rows are appended so
 * balances return to their pre-transaction values.
 */
export async function reverseTransaction(input: ReverseInput): Promise<void> {
  const bd = input.business_date || businessDate(input.startHour ?? 6);
  const batch = writeBatch(db);

  const ledgerSnap = await getDocs(query(collection(db, COLLECTIONS.stockLedger), where("ref_id", "==", input.id)));
  ledgerSnap.forEach((l) => {
    const row = l.data() as Record<string, unknown>;
    const movement = String(row.movement);
    if (movement === "adjust") return;
    const id2 = newId();
    batch.set(doc(db, COLLECTIONS.stockLedger, id2), meta({
      id: id2, entry_time: new Date().toISOString(), business_date: bd, tank_id: row.tank_id,
      fuel_type: row.fuel_type, movement: movement === "in" ? "out" : "in",
      quantity: row.quantity, balance_after: "", ref_type: "reversal", ref_id: input.id,
      notes: `${currentT().reversalPrefix} ${input.reason}`,
    }, input));
  });

  const cashSnap = await getDocs(query(collection(db, COLLECTIONS.cashbook), where("related_id", "==", input.id)));
  cashSnap.forEach((c) => {
    const row = c.data() as Record<string, unknown>;
    const id2 = newId();
    batch.set(doc(db, COLLECTIONS.cashbook, id2), meta({
      id: id2, ref_no: refNo("REV"), entry_date: new Date().toISOString(), business_date: bd,
      dir: String(row.dir) === "in" ? "out" : "in", category: "reversal", amount: row.amount,
      method: row.method, description: `${currentT().reversalPrefix} ${input.reason}`, related_table: row.related_table,
      related_id: input.id,
    }, input));
  });

  const reversedAt = new Date().toISOString();
  const deviceId = input.deviceId ?? ADMIN_DEVICE_ID;
  batch.update(doc(db, input.entity, input.id), {
    status: "reversed", reversal_reason: input.reason, reversed_by: input.actor,
    reversed_at: reversedAt, updated_at: reversedAt, updatedAt: reversedAt,
    device_id: deviceId, deviceId,
    version: increment(1),
    _updatedAt: serverTimestamp(),
  });

  await batch.commit();
}
