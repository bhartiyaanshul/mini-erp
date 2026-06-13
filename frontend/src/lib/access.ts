import type { AccessLevel, Module, User } from "./types";

const RANK: Record<AccessLevel, number> = { none: 0, user: 1, admin: 2 };

export const ACCESS_LEVELS: AccessLevel[] = ["none", "user", "admin"];

export function levelFor(user: User, module: Module): AccessLevel {
  return user.access?.[module] ?? "none";
}

/** Can the user see/read the module? System admins always can. */
export function canView(user: User, module: Module): boolean {
  return user.is_system_admin || RANK[levelFor(user, module)] >= RANK.user;
}

/** Does the user have Admin-level access on the module (confirm/delete/edit-BoM)? */
export function isAdminOn(user: User, module: Module): boolean {
  return user.is_system_admin || levelFor(user, module) === "admin";
}

export const ACCESS_LABEL: Record<AccessLevel, string> = {
  none: "None",
  user: "User",
  admin: "Admin",
};

export const MODULE_LABEL: Record<Module, string> = {
  sales: "Sales",
  purchase: "Purchase",
  manufacturing: "Manufacturing",
  product: "Product",
};
