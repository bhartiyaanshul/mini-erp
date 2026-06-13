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
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { User } from "./types";
import { canView } from "./access";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  visible: (user: User) => boolean;
}

export const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, visible: () => true },
  { to: "/sales", label: "Sales", icon: ShoppingCart, visible: (u) => canView(u, "sales") },
  { to: "/purchase", label: "Purchase", icon: Truck, visible: (u) => canView(u, "purchase") },
  { to: "/manufacturing", label: "Manufacturing", icon: Factory, visible: (u) => canView(u, "manufacturing") },
  { to: "/boms", label: "Bill of Materials", icon: ListTree, visible: (u) => canView(u, "manufacturing") },
  { to: "/products", label: "Products", icon: Package, visible: () => true },
  { to: "/inventory", label: "Inventory", icon: Boxes, visible: (u) => canView(u, "product") },
  { to: "/partners", label: "Partners", icon: Users, visible: (u) => canView(u, "sales") || canView(u, "purchase") },
  { to: "/users", label: "User Management", icon: ShieldCheck, visible: (u) => u.is_system_admin },
  { to: "/audit", label: "Audit Log", icon: ScrollText, visible: (u) => u.is_system_admin },
];

export function navForUser(user: User): NavItem[] {
  return NAV.filter((n) => n.visible(user));
}
