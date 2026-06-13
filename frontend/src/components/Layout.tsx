import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { LogOut, Boxes, Radio, Sparkles, Search, Bell, Building2, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import { navForUser } from "@/lib/nav";
import { useLive } from "@/lib/live";
import { useLoadDemo } from "@/lib/queries";
import { apiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Avatar, Button } from "./ui";
import { Copilot } from "./Copilot";
import { GlobalSearch } from "./GlobalSearch";

export function Layout() {
  const { user, logout } = useAuth();
  const { connected, events } = useLive();
  const nav = navForUser(user!);
  const loadDemo = useLoadDemo();
  const kind = user!.is_system_admin
    ? { label: "System Admin", color: "bg-teal-200 text-teal-900" }
    : { label: "System User", color: "bg-slate-200 text-slate-700" };
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [seenCount, setSeenCount] = useState(0);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebar-collapsed") === "1";
  });
  const notificationsRef = useRef<HTMLDivElement>(null);
  const notifications = useMemo(() => events.filter((e) => e.message).slice(0, 8), [events]);
  const unreadCount = Math.max(0, notifications.length - seenCount);

  function handleDemo() {
    loadDemo.mutate(undefined, {
      onSuccess: () => toast.success("Demo scenario loaded — Shiv Furniture Works"),
      onError: (e) => toast.error(apiError(e, "Failed to load demo")),
    });
  }

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!notificationsRef.current?.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function toggleNotifications() {
    setNotificationsOpen((open) => {
      const next = !open;
      if (next) setSeenCount(notifications.length);
      return next;
    });
  }

  function toggleSidebar() {
    setCollapsed((c) => {
      const next = !c;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      }
      return next;
    });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-teal-50">
      <aside
        className={cn(
          "relative z-20 hidden shrink-0 flex-col border-r border-teal-900/20 bg-teal-950 text-teal-50 transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] md:flex",
          collapsed ? "w-[80px]" : "w-[272px]"
        )}
      >
        <div className={cn("border-b border-white/10 py-5 transition-all duration-300", collapsed ? "px-4" : "px-5")}>
          <div className="flex items-center">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-teal-600 ring-1 ring-teal-700/20">
              <Boxes className="h-5 w-5 text-white" />
            </div>
            <div
              className={cn(
                "overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
                collapsed ? "ml-0 max-w-0 opacity-0" : "ml-3 max-w-[180px] opacity-100"
              )}
            >
              <p className="max-w-[170px] truncate whitespace-nowrap text-sm font-semibold leading-tight text-white">
                {user!.company_name || "Mini ERP"}
              </p>
              <p className="whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.16em] text-teal-200/70">
                Enterprise ERP
              </p>
            </div>
          </div>
          <div
            className={cn(
              "overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
              collapsed ? "mt-0 max-h-0 opacity-0" : "mt-4 max-h-32 opacity-100"
            )}
          >
            <div className="rounded-md border border-white/10 bg-white/[0.06] px-3 py-2">
              <div className="flex items-center gap-2 whitespace-nowrap text-xs font-medium text-teal-100">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-teal-300" />
                Production tenant
              </div>
              <p className="mt-1 whitespace-nowrap text-[11px] text-teal-200/60">Demand, stock, purchasing, and audit</p>
            </div>
          </div>
        </div>

        <button
          onClick={toggleSidebar}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="absolute -right-3.5 top-7 z-30 hidden h-7 w-7 items-center justify-center rounded-full border border-teal-100 bg-white text-teal-700 shadow-md shadow-teal-950/25 transition-all duration-200 hover:scale-110 hover:bg-teal-50 hover:text-teal-900 hover:shadow-lg active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-teal-950 md:flex"
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]", collapsed && "rotate-180")} />
        </button>

        <nav className="flex-1 space-y-0.5 px-3 py-4">
          <p
            className={cn(
              "overflow-hidden whitespace-nowrap px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-200/60 transition-all duration-300",
              collapsed ? "max-h-0 pb-0 opacity-0" : "max-h-6 pb-2 opacity-100"
            )}
          >
            Workspace
          </p>
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  "flex items-center rounded-md py-2.5 text-sm font-medium transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
                  collapsed ? "justify-center px-0" : "px-3",
                  isActive
                    ? "bg-teal-100 text-teal-950 ring-1 ring-teal-200/60"
                    : "text-teal-100/75 hover:bg-white/[0.08] hover:text-white"
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span
                className={cn(
                  "overflow-hidden whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
                  collapsed ? "ml-0 max-w-0 opacity-0" : "ml-3 max-w-[180px] opacity-100"
                )}
              >
                {item.label}
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div
            className={cn(
              "overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
              collapsed ? "mb-0 max-h-0 opacity-0" : "mb-2 max-h-16 opacity-100"
            )}
          >
            <div className="flex items-center justify-between whitespace-nowrap rounded-md border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-teal-100/80">
              <span className="inline-flex items-center gap-2">
                <Radio className={cn("h-3.5 w-3.5", connected ? "text-emerald-300" : "text-teal-200/50")} />
                {connected ? "Live sync" : "Reconnecting"}
              </span>
              <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-emerald-500" : "bg-amber-400")} />
            </div>
          </div>
          <div
            className={cn(
              "flex items-center rounded-md bg-white/[0.06] py-2.5 transition-all duration-300",
              collapsed ? "justify-center px-2" : "justify-between px-3"
            )}
          >
            <NavLink to="/profile" title="Your profile" className="flex min-w-0 items-center gap-2.5">
              <Avatar name={user!.full_name} photo={user!.photo} size="sm" className="ring-1 ring-white/20" />
              <div
                className={cn(
                  "min-w-0 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
                  collapsed ? "max-w-0 opacity-0" : "max-w-[150px] opacity-100"
                )}
              >
                <p className="truncate text-sm font-medium text-white hover:underline">{user!.full_name}</p>
                <p className={cn("mt-1 inline-block rounded px-1.5 text-[10px] font-semibold", kind.color)}>
                  {kind.label}
                </p>
              </div>
            </NavLink>
            <button
              onClick={logout}
              title="Log out"
              className={cn(
                "shrink-0 rounded-md p-1.5 text-teal-200/70 transition-colors hover:bg-white/10 hover:text-white",
                collapsed && "hidden"
              )}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="relative z-40 flex h-16 items-center justify-between gap-4 border-b border-teal-100 bg-teal-50/90 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-700 text-white">
              <Boxes className="h-4 w-4" />
            </div>
            <div>
              <p className="max-w-[150px] truncate text-sm font-semibold text-slate-950">{user!.company_name || "Mini ERP"}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Enterprise ERP</p>
            </div>
          </div>
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden h-9 w-full max-w-md items-center gap-2 rounded-md border border-teal-100 bg-white/70 px-3 text-sm text-slate-500 transition hover:border-teal-300 hover:bg-white lg:flex"
          >
            <Search className="h-4 w-4" />
            <span>Search orders, products, partners</span>
            <kbd className="ml-auto rounded border border-teal-100 bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
              ⌘K
            </kbd>
          </button>
          <div className="flex items-center gap-2">
            <button
              title="Search"
              onClick={() => setSearchOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-teal-100 bg-white/70 text-slate-500 hover:bg-teal-100/60 hover:text-teal-800 lg:hidden"
            >
              <Search className="h-4 w-4" />
            </button>
            <div ref={notificationsRef} className="relative">
              <button
                title="Notifications"
                onClick={toggleNotifications}
                className={cn(
                  "relative flex h-9 w-9 items-center justify-center rounded-md border border-teal-100 bg-white/70 text-slate-500 hover:bg-teal-100/60 hover:text-teal-800",
                  notificationsOpen && "bg-teal-100 text-teal-800"
                )}
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="fixed right-4 top-[72px] z-[70] w-[min(calc(100vw-2rem),360px)] overflow-hidden rounded-lg border border-teal-100 bg-white shadow-xl shadow-teal-950/20 md:right-6">
                  <div className="flex items-center justify-between border-b border-teal-100 bg-teal-50 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Notifications</p>
                      <p className="text-xs text-slate-500">Recent ERP activity</p>
                    </div>
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
                      {notifications.length}
                    </span>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <Bell className="mx-auto h-6 w-6 text-slate-300" />
                      <p className="mt-2 text-sm font-semibold text-slate-700">No notifications yet</p>
                      <p className="mt-1 text-xs text-slate-500">New order, stock, and procurement updates will appear here.</p>
                    </div>
                  ) : (
                    <ul className="max-h-[320px] overflow-y-auto divide-y divide-teal-50">
                      {notifications.map((event, index) => (
                        <li key={`${event.ts}-${event.type}-${index}`} className="px-4 py-2.5 hover:bg-teal-50/70">
                          <div className="flex gap-3">
                            <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", eventDot(event.type))} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium leading-5 text-slate-800">{event.message}</p>
                              <p className="mt-1 text-[11px] text-slate-400">{formatEventTime(event.ts)}</p>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            {user!.is_system_admin && (
              <Button variant="outline" size="sm" onClick={handleDemo} loading={loadDemo.isPending}>
                <Sparkles className="h-4 w-4 text-teal-700" />
                Load Demo Scenario
              </Button>
            )}
            <NavLink
              to="/profile"
              title="Your profile"
              className="rounded-full transition hover:ring-2 hover:ring-teal-300 hover:ring-offset-2 hover:ring-offset-teal-50"
            >
              <Avatar name={user!.full_name} photo={user!.photo} size="sm" />
            </NavLink>
          </div>
        </header>
        <nav className="flex gap-2 overflow-x-auto border-b border-teal-100 bg-teal-50/90 px-4 py-2 md:hidden">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold",
                  isActive ? "bg-teal-100 text-teal-800" : "text-slate-600 hover:bg-teal-100/70 hover:text-teal-900"
                )
              }
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="flex-1 overflow-y-auto bg-teal-50 px-4 py-5 md:px-6">
          <div className="mx-auto max-w-[1440px] animate-in">
            <Outlet />
          </div>
        </main>
      </div>

      <Copilot />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function eventDot(type: string): string {
  if (type.includes("procurement")) return "bg-teal-500";
  if (type.includes("completed") || type.includes("delivered") || type.includes("received")) return "bg-emerald-500";
  if (type.includes("confirmed")) return "bg-blue-500";
  if (type.includes("created")) return "bg-amber-500";
  return "bg-slate-400";
}

function formatEventTime(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
