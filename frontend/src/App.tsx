import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { LiveProvider } from "./lib/live";
import { Layout } from "./components/Layout";
import { AccessDenied } from "./components/AccessDenied";
import { canView } from "./lib/access";
import type { User } from "./lib/types";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Landing from "./pages/Landing";
import Track from "./pages/Track";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Sales from "./pages/Sales";
import Purchase from "./pages/Purchase";
import Manufacturing from "./pages/Manufacturing";
import BoMs from "./pages/BoMs";
import Partners from "./pages/Partners";
import Inventory from "./pages/Inventory";
import Audit from "./pages/Audit";
import UserManagement from "./pages/UserManagement";
import Profile from "./pages/Profile";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

function Guard({ can, children }: { can: (u: User) => boolean; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!can(user)) return <AccessDenied />;
  return <>{children}</>;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/track/:token" element={<Track />} />
      <Route path="/welcome" element={user ? <Navigate to="/" replace /> : <Landing />} />
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/signup" element={user ? <Navigate to="/" replace /> : <Signup />} />
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
        <Route path="/profile" element={<Profile />} />
        <Route path="/sales" element={<Guard can={(u) => canView(u, "sales")}><Sales /></Guard>} />
        <Route path="/purchase" element={<Guard can={(u) => canView(u, "purchase")}><Purchase /></Guard>} />
        <Route path="/manufacturing" element={<Guard can={(u) => canView(u, "manufacturing")}><Manufacturing /></Guard>} />
        <Route path="/boms" element={<Guard can={(u) => canView(u, "manufacturing")}><BoMs /></Guard>} />
        <Route path="/inventory" element={<Guard can={(u) => canView(u, "product")}><Inventory /></Guard>} />
        <Route
          path="/partners"
          element={<Guard can={(u) => canView(u, "sales") || canView(u, "purchase")}><Partners /></Guard>}
        />
        <Route path="/users" element={<Guard can={(u) => u.is_system_admin}><UserManagement /></Guard>} />
        <Route path="/audit" element={<Guard can={(u) => u.is_system_admin}><Audit /></Guard>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
