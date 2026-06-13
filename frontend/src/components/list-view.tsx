import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, X, LayoutGrid, List as ListIcon, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { cn, titleCase } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Shared list/grid view controls used across every "info" page.
 * One hook holds the view mode, grid sizing, search query and filters;
 * <ListToolbar/> renders the matching control bar.
 * ------------------------------------------------------------------ */

export type ViewMode = "list" | "grid";
export type GridSize = "sm" | "md" | "lg";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDef {
  key: string;
  label: string;
  icon?: LucideIcon;
  options: FilterOption[];
}

export interface ListControls {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  gridSize: GridSize;
  setGridSize: (g: GridSize) => void;
  query: string;
  setQuery: (q: string) => void;
  filters: Record<string, string>;
  setFilter: (key: string, value: string) => void;
  reset: () => void;
  activeCount: number;
}

/** Column layout per grid size — denser grid = smaller cards. */
export const GRID_COLS: Record<GridSize, string> = {
  sm: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5",
  md: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
  lg: "grid-cols-1 lg:grid-cols-2",
};

export const DATE_PRESETS: FilterOption[] = [
  { value: "", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
];

/** Returns true when `iso` falls inside the selected preset window. */
export function matchesDatePreset(iso: string | null | undefined, preset?: string): boolean {
  if (!preset) return true;
  if (!iso) return false;
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  if (preset === "today") return d.toDateString() === now.toDateString();
  if (preset === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 0;
  if (days) return d.getTime() >= now.getTime() - days * 86_400_000;
  return true;
}

/** Build filter options from raw enum values, title-casing each label. */
export const toOptions = (values: string[]): FilterOption[] =>
  values.map((v) => ({ value: v, label: titleCase(v) }));

function readStored(key: string): { view?: ViewMode; gridSize?: GridSize } {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(`erp:view:${key}`) || "{}");
  } catch {
    return {};
  }
}

export function useListControls(key: string, opts: { defaultView?: ViewMode } = {}): ListControls {
  const [params] = useSearchParams();
  const [view, setView] = useState<ViewMode>(() => readStored(key).view ?? opts.defaultView ?? "list");
  const [gridSize, setGridSize] = useState<GridSize>(() => readStored(key).gridSize ?? "md");
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [filters, setFilters] = useState<Record<string, string>>({});

  // Persist the view preference per page.
  useEffect(() => {
    try {
      window.localStorage.setItem(`erp:view:${key}`, JSON.stringify({ view, gridSize }));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, [key, view, gridSize]);

  // Pick up ?q= changes pushed by the global search palette.
  const urlQuery = params.get("q");
  useEffect(() => {
    if (urlQuery != null) setQuery(urlQuery);
  }, [urlQuery]);

  const setFilter = useCallback((k: string, v: string) => setFilters((f) => ({ ...f, [k]: v })), []);
  const reset = useCallback(() => {
    setQuery("");
    setFilters({});
  }, []);
  const activeCount = useMemo(
    () => Object.values(filters).filter(Boolean).length + (query.trim() ? 1 : 0),
    [filters, query]
  );

  return { view, setView, gridSize, setGridSize, query, setQuery, filters, setFilter, reset, activeCount };
}

/* --------------------------------- UI ---------------------------------- */
function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-teal-100 bg-white/80 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-8 items-center justify-center gap-1.5 rounded px-2.5 text-xs font-semibold transition-colors",
            value === o.value ? "bg-teal-700 text-white shadow-sm" : "text-slate-500 hover:bg-teal-100/70 hover:text-teal-900"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FilterSelect({ def, value, onChange }: { def: FilterDef; value: string; onChange: (v: string) => void }) {
  const Icon = def.icon;
  const hasAll = def.options.some((o) => o.value === "");
  const options = hasAll ? def.options : [{ value: "", label: `All ${def.label.toLowerCase()}` }, ...def.options];
  const active = !!value;
  return (
    <div className="relative">
      {Icon && (
        <Icon
          className={cn(
            "pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2",
            active ? "text-teal-700" : "text-slate-400"
          )}
        />
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={def.label}
        className={cn(
          "h-9 rounded-md border bg-white/90 pr-7 text-xs font-medium text-slate-700 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100",
          Icon ? "pl-8" : "pl-3",
          active ? "border-teal-300 bg-teal-50/70 text-teal-900" : "border-teal-100"
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ListToolbar({
  controls,
  filters = [],
  searchPlaceholder = "Search…",
  gridCapable = true,
  count,
  className,
}: {
  controls: ListControls;
  filters?: FilterDef[];
  searchPlaceholder?: string;
  gridCapable?: boolean;
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-2", className)}>
      {/* Search */}
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={controls.query}
          onChange={(e) => controls.setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 w-full rounded-md border border-teal-100 bg-white/90 pl-9 pr-9 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        />
        {controls.query && (
          <button
            type="button"
            onClick={() => controls.setQuery("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-teal-50 hover:text-teal-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Filters */}
      {filters.map((def) => (
        <FilterSelect key={def.key} def={def} value={controls.filters[def.key] ?? ""} onChange={(v) => controls.setFilter(def.key, v)} />
      ))}

      {controls.activeCount > 0 && (
        <button
          type="button"
          onClick={controls.reset}
          className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-500 hover:bg-teal-100/70 hover:text-teal-900"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      )}

      {typeof count === "number" && (
        <span className="ml-auto whitespace-nowrap text-xs font-medium text-slate-400">
          {count} {count === 1 ? "result" : "results"}
        </span>
      )}

      {/* View controls */}
      {gridCapable && (
        <div className={cn("flex items-center gap-2", typeof count === "number" ? "" : "ml-auto")}>
          {controls.view === "grid" && (
            <Segmented<GridSize>
              value={controls.gridSize}
              onChange={controls.setGridSize}
              options={[
                { value: "sm", label: "S", title: "Small cards" },
                { value: "md", label: "M", title: "Medium cards" },
                { value: "lg", label: "L", title: "Large cards" },
              ]}
            />
          )}
          <Segmented<ViewMode>
            value={controls.view}
            onChange={controls.setView}
            options={[
              { value: "list", label: <ListIcon className="h-4 w-4" />, title: "List view" },
              { value: "grid", label: <LayoutGrid className="h-4 w-4" />, title: "Grid view" },
            ]}
          />
        </div>
      )}
    </div>
  );
}

/** Shared empty-results placeholder when filters/search match nothing. */
export function NoResults({ onReset }: { onReset?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-teal-200 bg-white/80 py-14 text-center">
      <SlidersHorizontal className="mb-3 h-8 w-8 text-slate-300" />
      <p className="font-semibold text-slate-700">No matches</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">Try a different search term or clear the active filters.</p>
      {onReset && (
        <button onClick={onReset} className="mt-3 text-sm font-semibold text-teal-700 hover:text-teal-900">
          Clear filters
        </button>
      )}
    </div>
  );
}
