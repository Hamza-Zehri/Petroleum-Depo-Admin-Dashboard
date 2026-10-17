// Single live data store for the dashboard. One set of Firestore subscriptions
// feeds every page, and the shared accounting derivations are computed once.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  computeCustomerBalances, computeSupplierBalances, computeTankStocks, cashBalance,
  useCollection, useSettings, fuelStock, fuelCapacity, weightedAvgCost, type TankStock,
} from "./repo";
import { COLLECTIONS, type Role } from "./types";
import Decimal from "decimal.js";
import { D, businessDate } from "./format";

function useAll<T extends Record<string, unknown>>(name: string, tag: string) {
  const { data, loading, error } = useCollection<T>(name, [], [`store-${tag}`]);
  return { data, loading, error };
}

export interface DepotData {
  tanks: Record<string, unknown>[];
  customers: Record<string, unknown>[];
  suppliers: Record<string, unknown>[];
  vehicles: Record<string, unknown>[];
  purchases: Record<string, unknown>[];
  sales: Record<string, unknown>[];
  customerPayments: Record<string, unknown>[];
  supplierPayments: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
  cashbook: Record<string, unknown>[];
  stockLedger: Record<string, unknown>[];
  tankDips: Record<string, unknown>[];
  dailyClosings: Record<string, unknown>[];
  settings: Record<string, string>;
  loading: boolean;
  errors: string[];
  // derived
  stocks: TankStock[];
  petrolStock: Decimal;
  dieselStock: Decimal;
  petrolCapacity: Decimal;
  dieselCapacity: Decimal;
  customerBalances: ReturnType<typeof computeCustomerBalances>;
  supplierBalances: ReturnType<typeof computeSupplierBalances>;
  cashInHand: Decimal;
  bankBalance: Decimal;
  today: string;
  costPerLitre: (fuel: string) => Decimal;
}

const Ctx = createContext<DepotData | null>(null);

export function DepotProvider({ children }: { children: ReactNode }) {
  const tanks = useAll("tanks", "tanks");
  const customers = useAll("customers", "cust");
  const suppliers = useAll("suppliers", "supp");
  const vehicles = useAll("vehicles", "veh");
  const purchases = useAll("purchases", "pur");
  const sales = useAll("sales", "sal");
  const customerPayments = useAll("customer_payments", "cp");
  const supplierPayments = useAll("supplier_payments", "sp");
  const expenses = useAll("expenses", "exp");
  const cashbook = useAll("cashbook", "cb");
  const stockLedger = useAll("stock_ledger", "sl");
  const tankDips = useAll("tank_dips", "dip");
  const dailyClosings = useAll("daily_closings", "dc");
  const { settings } = useSettings();

  const value = useMemo<DepotData>(() => {
    const stocks = computeTankStocks(tanks.data, stockLedger.data);
    const customerBalances = computeCustomerBalances(customers.data, sales.data, customerPayments.data);
    const supplierBalances = computeSupplierBalances(suppliers.data, purchases.data, supplierPayments.data);
    const costCache = new Map<string, Decimal>();
    return {
      tanks: tanks.data, customers: customers.data, suppliers: suppliers.data, vehicles: vehicles.data,
      purchases: purchases.data, sales: sales.data, customerPayments: customerPayments.data,
      supplierPayments: supplierPayments.data, expenses: expenses.data, cashbook: cashbook.data,
      stockLedger: stockLedger.data, tankDips: tankDips.data, dailyClosings: dailyClosings.data,
      settings,
      loading: tanks.loading || sales.loading || purchases.loading,
      errors: [tanks, customers, suppliers, vehicles, purchases, sales, customerPayments,
        supplierPayments, expenses, cashbook, stockLedger, tankDips, dailyClosings]
        .map((x) => x.error).filter(Boolean) as string[],
      stocks,
      petrolStock: fuelStock(stocks, "petrol"),
      dieselStock: fuelStock(stocks, "diesel"),
      petrolCapacity: fuelCapacity(tanks.data, "petrol"),
      dieselCapacity: fuelCapacity(tanks.data, "diesel"),
      customerBalances, supplierBalances,
      cashInHand: cashBalance(cashbook.data, "cash"),
      bankBalance: cashBalance(cashbook.data, "bank"),
      today: businessDate(Number(settings.business_day_start_hour ?? 6)),
      costPerLitre: (fuel: string) => {
        if (!costCache.has(fuel)) costCache.set(fuel, weightedAvgCost(fuel, purchases.data, sales.data));
        return costCache.get(fuel)!;
      },
    };
  }, [tanks.data, customers.data, suppliers.data, vehicles.data, purchases.data, sales.data,
    customerPayments.data, supplierPayments.data, expenses.data, cashbook.data, stockLedger.data,
    tankDips.data, dailyClosings.data, settings, tanks.loading, sales.loading, purchases.loading,
    tanks.error, customers.error, suppliers.error, vehicles.error, purchases.error, sales.error,
    customerPayments.error, supplierPayments.error, expenses.error, cashbook.error, stockLedger.error,
    tankDips.error, dailyClosings.error]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDepot(): DepotData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDepot must be used inside <DepotProvider>");
  return ctx;
}

export { COLLECTIONS, D };
export type { Role };
