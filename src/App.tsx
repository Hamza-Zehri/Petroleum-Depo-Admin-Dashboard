import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { LangProvider } from "./lib/lang";
import { ThemeProvider } from "./lib/theme";
import { DepotProvider } from "./lib/store";
import { ToastProvider, LoadingState } from "./components/ui";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import ClaimOwner from "./pages/ClaimOwner";
import Dashboard from "./pages/Dashboard";
import Stock from "./pages/Stock";
import Purchases from "./pages/Purchases";
import Sales from "./pages/Sales";
import Customers from "./pages/Customers";
import Suppliers from "./pages/Suppliers";
import Ledger from "./pages/Ledger";
import Cashbook from "./pages/Cashbook";
import Expenses from "./pages/Expenses";
import Profit from "./pages/Profit";
import Reports from "./pages/Reports";
import Closing from "./pages/Closing";
import Users from "./pages/Users";
import Sync from "./pages/Sync";
import Receipts from "./pages/Receipts";
import Backups from "./pages/Backups";
import Settings from "./pages/Settings";

function Routed() {
  const { ready, user, profileMissing } = useAuth();
  if (!ready) return <div className="app-loading"><LoadingState label="فائر بیس سے کنکشن…" /></div>;
  if (!user) return <Login />;
  if (profileMissing) return <ClaimOwner />;
  return (
    <DepotProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/cashbook" element={<Cashbook />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/profit" element={<Profit />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/closing" element={<Closing />} />
          <Route path="/users" element={<Users />} />
          <Route path="/sync" element={<Sync />} />
          <Route path="/receipts" element={<Receipts />} />
          <Route path="/backups" element={<Backups />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </DepotProvider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ThemeProvider>
        <LangProvider>
          <AuthProvider>
          <BrowserRouter>
          <Routed />
        </BrowserRouter>
        </AuthProvider>
      </LangProvider>
      </ThemeProvider>
    </ToastProvider>
  );
}
