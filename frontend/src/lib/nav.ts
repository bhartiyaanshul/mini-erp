import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  Factory,
  ListTree,
  Users,
  Boxes,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "./types";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[]; // undefined => everyone (admin always sees all)
}

export const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/sales", label: "Sales", icon: ShoppingCart, roles: ["sales"] },
  { to: "/purchase", label: "Purchase", icon: Truck, roles: ["purchase"] },
  { to: "/manufacturing", label: "Manufacturing", icon: Factory, roles: ["manufacturing"] },
  { to: "/boms", label: "Bill of Materials", icon: ListTree, roles: ["manufacturing", "owner"] },
  { to: "/products", label: "Products", icon: Package },
  { to: "/inventory", label: "Inventory", icon: Boxes, roles: ["inventory", "owner"] },
  { to: "/partners", label: "Partners", icon: Users, roles: ["sales", "purchase", "owner"] },
  { to: "/audit", label: "Audit Log", icon: ScrollText, roles: ["owner"] },
];

export function navForRole(role: Role): NavItem[] {
  if (role === "admin") return NAV;
  return NAV.filter((n) => !n.roles || n.roles.includes(role));
}

export const ROLE_META: Record<Role, { label: string; color: string }> = {
  admin: { label: "Admin", color: "bg-slate-800 text-white" },
  sales: { label: "Sales", color: "bg-blue-100 text-blue-700" },
  purchase: { label: "Purchase", color: "bg-amber-100 text-amber-700" },
  manufacturing: { label: "Manufacturing", color: "bg-indigo-100 text-indigo-700" },
  inventory: { label: "Inventory", color: "bg-emerald-100 text-emerald-700" },
  owner: { label: "Business Owner", color: "bg-rose-100 text-rose-700" },
};
