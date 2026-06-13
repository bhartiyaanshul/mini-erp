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

/** Largest quantity a single order / BoM line may carry — guards against runaway subtotals. */
export const MAX_QTY = 1_000_000;

/** Coerce free-typed input into a whole quantity within [min, max]. Empty/invalid → min. */
export function clampQty(value: number | string, max = MAX_QTY, min = 1): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < min) return min;
  return Math.min(n, max);
}

/** Largest unit price/amount allowed — keeps order totals sane. */
export const MAX_PRICE = 100_000_000; // ₹10 crore per unit

/** Coerce free-typed input into a non-negative amount within [0, max]. Empty/invalid → 0. */
export function clampMoney(value: number | string, max = MAX_PRICE): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}
