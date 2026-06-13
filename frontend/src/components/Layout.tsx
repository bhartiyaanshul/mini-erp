import { NavLink, Outlet } from "react-router-dom";
import { LogOut, Boxes, Radio, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import { navForRole, ROLE_META } from "@/lib/nav";
import { useLive } from "@/lib/live";
import { useLoadDemo } from "@/lib/queries";
import { apiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "./ui";

export function Layout() {
  const { user, logout } = useAuth();
  const { connected } = useLive();
  const nav = navForRole(user!.role);
  const loadDemo = useLoadDemo();
  const meta = ROLE_META[user!.role];

  function handleDemo() {
    loadDemo.mutate(undefined, {
      onSuccess: () => toast.success("Demo scenario loaded — Shiv Furniture Works"),
      onError: (e) => toast.error(apiError(e, "Failed to load demo")),
    });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col bg-slate-900 text-slate-300">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600">
            <Boxes className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-white">Shiv Furniture</p>
            <p className="text-[11px] text-slate-400">Mini ERP</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-brand-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                )
              }
            >
              <item.icon className="h-4.5 w-4.5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-3">
          <div className="mb-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-400">
            <Radio className={cn("h-3.5 w-3.5", connected ? "text-emerald-400" : "text-slate-600")} />
            {connected ? "Live feed connected" : "Connecting…"}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-800 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{user!.full_name}</p>
              <p className={cn("mt-0.5 inline-block rounded px-1.5 text-[10px] font-semibold", meta.color)}>
                {meta.label}
              </p>
            </div>
            <button onClick={logout} title="Log out" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-end gap-3 border-b border-slate-200 bg-white px-6">
          {user!.role === "admin" && (
            <Button variant="outline" size="sm" onClick={handleDemo} loading={loadDemo.isPending}>
              <Sparkles className="h-4 w-4 text-brand-600" />
              Load Demo Scenario
            </Button>
          )}
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-7xl animate-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
