import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2, X } from "lucide-react";
import { cn, clampQty, MAX_QTY, titleCase } from "@/lib/utils";

/* ------------------------------- Button -------------------------------- */
type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-teal-700 text-white shadow-sm shadow-teal-900/10 hover:bg-teal-800",
  secondary: "bg-slate-900 text-white shadow-sm shadow-slate-900/10 hover:bg-slate-800",
  outline: "border border-teal-200 bg-teal-50/70 text-slate-700 shadow-sm hover:border-teal-300 hover:bg-teal-100/70",
  ghost: "text-slate-600 hover:bg-teal-100/70 hover:text-teal-900",
  danger: "bg-rose-700 text-white shadow-sm shadow-rose-900/10 hover:bg-rose-800",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  icon: "h-9 w-9",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/* -------------------------------- Card --------------------------------- */
export function Card({ className, children, style }: { className?: string; children: ReactNode; style?: CSSProperties }) {
  return <div style={style} className={cn("rounded-lg border border-teal-100 bg-white/85 shadow-sm shadow-teal-950/[0.04] backdrop-blur", className)}>{children}</div>;
}
export function CardHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex items-center justify-between border-b border-teal-100 px-5 py-4", className)}>{children}</div>;
}
export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("text-sm font-semibold text-slate-900", className)}>{children}</h3>;
}
export function CardContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

/* ------------------------------- Inputs -------------------------------- */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <label className={cn("mb-1.5 block text-xs font-semibold text-slate-600", className)}>{children}</label>;
}
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-teal-100 bg-white/90 px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100",
        className
      )}
      {...props}
    />
  );
}
/**
 * Whole-number quantity field. A plain text input (not type="number", so no scroll-wheel /
 * arrow-key / "e" quirks) that only accepts digits, lets the user clear it freely while typing,
 * and on blur enforces the floor — the committed value is always an integer ≥ `min`.
 */
export function QtyInput({
  value,
  onChange,
  min = 1,
  max = MAX_QTY,
  onBlur,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max"> & {
  value: number;
  onChange: (qty: number) => void;
  min?: number;
  max?: number;
}) {
  // Local text mirror so the field can be momentarily empty mid-edit without snapping to `min`.
  const [text, setText] = useState(() => String(value));
  const lastEmitted = useRef(value);

  // Resync only when `value` changes from the outside (e.g. row reset), not from our own onChange.
  useEffect(() => {
    if (value !== lastEmitted.current) {
      setText(String(value));
      lastEmitted.current = value;
    }
  }, [value]);

  const commit = (n: number) => {
    lastEmitted.current = n;
    onChange(n);
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={(e) => {
        const raw = e.target.value.replace(/\D/g, ""); // digits only
        setText(raw);
        if (raw !== "") commit(clampQty(raw, max, min));
      }}
      onBlur={(e) => {
        const n = clampQty(text, max, min);
        setText(String(n));
        commit(n);
        onBlur?.(e);
      }}
      {...props}
    />
  );
}
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md border border-teal-100 bg-white/90 px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100",
        className
      )}
      {...props}
    />
  );
}
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-md border border-teal-100 bg-white/90 px-3 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/* ------------------------------- Badge --------------------------------- */
export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold", className)}>
      {children}
    </span>
  );
}

const STATE_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  confirmed: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  partially_delivered: "bg-amber-100 text-amber-700",
  partially_received: "bg-amber-100 text-amber-700",
  fully_delivered: "bg-emerald-100 text-emerald-700",
  fully_received: "bg-emerald-100 text-emerald-700",
  done: "bg-emerald-100 text-emerald-700",
  completed: "bg-emerald-100 text-emerald-700",
  pending: "bg-slate-100 text-slate-600",
  cancelled: "bg-rose-100 text-rose-700",
};

export function StateBadge({ state }: { state: string }) {
  return <Badge className={STATE_COLORS[state] ?? "bg-slate-100 text-slate-600"}>{titleCase(state)}</Badge>;
}

/* ------------------------------- Avatar -------------------------------- */
const AVATAR_COLORS = [
  "bg-teal-100 text-teal-800",
  "bg-blue-100 text-blue-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-cyan-100 text-cyan-700",
];

const AVATAR_SIZES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({
  name,
  photo,
  size = "md",
  className,
}: {
  name: string;
  photo?: string | null;
  size?: keyof typeof AVATAR_SIZES;
  className?: string;
}) {
  return (
    <span
      title={name}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold leading-none",
        photo ? "bg-slate-100" : colorFor(name),
        AVATAR_SIZES[size],
        className
      )}
    >
      {photo ? <img src={photo} alt={name} className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}

/* ------------------------------- Modal --------------------------------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className={cn("mt-12 w-full animate-in rounded-lg border border-teal-100 bg-white/95 shadow-xl shadow-teal-950/15", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="flex items-center justify-between border-b border-teal-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-teal-50 hover:text-teal-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------ Helpers -------------------------------- */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-teal-500", className)} />;
}

export function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-teal-200 bg-white/80 py-14 text-center">
      {icon && <div className="mb-3 text-slate-300">{icon}</div>}
      <p className="font-semibold text-slate-700">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4 border-b border-teal-200 pb-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
