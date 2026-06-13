import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Package, Users, ShoppingCart, Truck, Factory, CornerDownLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { canView } from "@/lib/access";
import { useProducts, usePartners, useSales, usePurchase, useMOs } from "@/lib/queries";
import { cn, money, titleCase } from "@/lib/utils";
import { StateBadge } from "./ui";

interface Hit {
  group: string;
  icon: LucideIcon;
  title: string;
  sub: string;
  badge?: string;
  to: string;
}

const PER_GROUP = 5;

/**
 * Command-palette style global search (⌘K / Ctrl+K). Searches the cached
 * data sets the user can access and routes to the owning page with ?q= so
 * the destination list pre-filters to the match.
 */
export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const canSales = canView(user!, "sales");
  const canPurchase = canView(user!, "purchase");
  const canMfg = canView(user!, "manufacturing");
  const canPartners = canSales || canPurchase;

  const { data: products } = useProducts();
  const { data: partners } = usePartners(undefined, open && canPartners);
  const { data: sales } = useSales(open && canSales);
  const { data: purchase } = usePurchase(open && canPurchase);
  const { data: mos } = useMOs(open && canMfg);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const term = q.trim().toLowerCase();

  const hits = useMemo<Hit[]>(() => {
    if (!term) return [];
    const match = (...fields: (string | null | undefined)[]) =>
      fields.some((f) => f && f.toLowerCase().includes(term));
    const out: Hit[] = [];

    for (const p of (products ?? []).filter((p) => match(p.name, p.sku)).slice(0, PER_GROUP)) {
      out.push({
        group: "Products",
        icon: Package,
        title: p.name,
        sub: `${p.sku || "No SKU"} · ${money(p.sales_price)}`,
        badge: `${p.free_to_use} free`,
        to: `/products?q=${encodeURIComponent(p.name)}`,
      });
    }
    for (const s of (sales ?? []).filter((o) => match(o.name, o.partner_name)).slice(0, PER_GROUP)) {
      out.push({
        group: "Sales Orders",
        icon: ShoppingCart,
        title: s.name,
        sub: `${s.partner_name} · ${money(s.total)}`,
        badge: s.state,
        to: `/sales?q=${encodeURIComponent(s.name)}`,
      });
    }
    for (const o of (purchase ?? []).filter((o) => match(o.name, o.partner_name, o.origin)).slice(0, PER_GROUP)) {
      out.push({
        group: "Purchase Orders",
        icon: Truck,
        title: o.name,
        sub: `${o.partner_name || "Vendor"} · ${money(o.total)}`,
        badge: o.state,
        to: `/purchase?q=${encodeURIComponent(o.name)}`,
      });
    }
    for (const m of (mos ?? []).filter((o) => match(o.name, o.product_name)).slice(0, PER_GROUP)) {
      out.push({
        group: "Manufacturing",
        icon: Factory,
        title: m.name,
        sub: `${m.qty} × ${m.product_name}`,
        badge: m.state,
        to: `/manufacturing?q=${encodeURIComponent(m.name)}`,
      });
    }
    for (const p of (partners ?? []).filter((p) => match(p.name, p.email, p.phone)).slice(0, PER_GROUP)) {
      out.push({
        group: "Partners",
        icon: Users,
        title: p.name,
        sub: p.email || p.phone || titleCase(p.type),
        badge: p.type,
        to: `/partners?q=${encodeURIComponent(p.name)}`,
      });
    }
    return out;
  }, [term, products, sales, purchase, mos, partners]);

  useEffect(() => setActive(0), [term]);

  function go(hit: Hit) {
    navigate(hit.to);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") return onClose();
    if (!hits.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(hits[active]);
    }
  }

  if (!open) return null;

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mt-[12vh] w-full max-w-xl animate-in overflow-hidden rounded-xl border border-teal-100 bg-white shadow-2xl shadow-teal-950/25"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-teal-100 px-4">
          <Search className="h-5 w-5 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search products, orders, partners…"
            className="h-14 flex-1 bg-transparent text-base text-slate-800 outline-none placeholder:text-slate-400"
          />
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-teal-50 hover:text-teal-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-2">
          {!term ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">
              Start typing to search across every module.
            </p>
          ) : !hits.length ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">
              No matches for “{q}”.
            </p>
          ) : (
            hits.map((hit, i) => {
              const header = hit.group !== lastGroup ? hit.group : null;
              lastGroup = hit.group;
              return (
                <div key={`${hit.to}-${i}`}>
                  {header && (
                    <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {header}
                    </p>
                  )}
                  <button
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(hit)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2 text-left",
                      i === active ? "bg-teal-50" : "hover:bg-teal-50/60"
                    )}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-teal-100/70 text-teal-700">
                      <hit.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{hit.title}</span>
                      <span className="block truncate text-xs text-slate-500">{hit.sub}</span>
                    </span>
                    {hit.badge && <StateBadge state={hit.badge} />}
                    {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
