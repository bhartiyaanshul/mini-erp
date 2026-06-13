import { clsx, type ClassValue } from "clsx";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export const money = (n: number) =>
  "₹" + (n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export const qty = (n: number) =>
  n == null ? "0" : Number.isInteger(n) ? n.toString() : n.toFixed(2).replace(/\.?0+$/, "");

export const fmtDateTime = (s?: string | null) =>
  s ? new Date(s.endsWith("Z") || s.includes("+") ? s : s + "Z").toLocaleString() : "—";

export const fmtTime = (s?: string | null) =>
  s
    ? new Date(s.endsWith("Z") || s.includes("+") ? s : s + "Z").toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
