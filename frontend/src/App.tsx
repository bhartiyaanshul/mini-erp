import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { LiveProvider } from "./lib/live";
import { Layout } from "./components/Layout";
import { AccessDenied } from "./components/AccessDenied";
import type { Role } from "./lib/types";
import Login from "./pages/Login";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Sales from "./pages/Sales";
import Purchase from "./pages/Purchase";
import Manufacturing from "./pages/Manufacturing";
import BoMs from "./pages/BoMs";
import Partners from "./pages/Partners";
import Inventory from "./pages/Inventory";
import Audit from "./pages/Audit";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

function Guard({ roles, children }: { roles?: Role[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && user.role !== "admin" && !roles.includes(user.role)) return <AccessDenied />;
  return <>{children}</>;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/welcome" element={user ? <Navigate to="/" replace /> : <Landing />} />
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        element={
          <RequireAuth>
            <LiveProvider>
              <Layout />
            </LiveProvider>
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/sales" element={<Guard roles={["sales"]}><Sales /></Guard>} />
        <Route path="/purchase" element={<Guard roles={["purchase"]}><Purchase /></Guard>} />
        <Route path="/manufacturing" element={<Guard roles={["manufacturing"]}><Manufacturing /></Guard>} />
        <Route path="/boms" element={<Guard roles={["manufacturing", "owner"]}><BoMs /></Guard>} />
        <Route path="/inventory" element={<Guard roles={["inventory", "owner"]}><Inventory /></Guard>} />
        <Route path="/partners" element={<Guard roles={["sales", "purchase", "owner"]}><Partners /></Guard>} />
        <Route path="/audit" element={<Guard roles={["owner"]}><Audit /></Guard>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
