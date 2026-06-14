import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Check,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Factory,
  History,
  Layers,
  PackageCheck,
  Pause,
  Play,
  RotateCcw,
  ShoppingCart,
  Sliders,
  Truck,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  useTimeMachineActivity,
  useTimeMachineRange,
  useTimeMachineSeries,
  useTimeMachineSnapshot,
} from "@/lib/queries";
import type { ActivityEvent } from "@/lib/types";
import { Button, Card, Modal, PageHeader, PageLoader, Spinner } from "@/components/ui";
import { cn, money, qty as fmtQty } from "@/lib/utils";

const DAY = 86_400_000;
const TEAL = "#0f766e";

const toInput = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const KIND_ICON: Record<string, typeof Circle> = {
  placed: ShoppingCart,
  confirmed: ClipboardCheck,
  purchase: Truck,
  received: PackageCheck,
  manufacture: Factory,
  produced: CheckCircle2,
  auto: Zap,
  delivered: Truck,
  cancelled: XCircle,
  blocked: AlertTriangle,
  adjusted: Sliders,
};

const KIND_TONE: Record<string, string> = {
  placed: "bg-teal-100 text-teal-700",
  confirmed: "bg-blue-100 text-blue-700",
  purchase: "bg-amber-100 text-amber-700",
  received: "bg-emerald-100 text-emerald-700",
  manufacture: "bg-indigo-100 text-indigo-700",
  produced: "bg-emerald-100 text-emerald-700",
  auto: "bg-sky-100 text-sky-700",
  delivered: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-rose-100 text-rose-700",
  blocked: "bg-rose-100 text-rose-700",
  adjusted: "bg-amber-100 text-amber-700",
};

// Lifecycle stages and which event kind advances each one.
const STAGES = [
  { label: "Ordered", Icon: ShoppingCart },
  { label: "Confirmed", Icon: ClipboardCheck },
  { label: "In production", Icon: Factory },
  { label: "Received", Icon: PackageCheck },
  { label: "Delivered", Icon: Truck },
];
const STAGE_OF: Record<string, number> = {
  placed: 0,
  confirmed: 1,
  manufacture: 2,
  auto: 2,
  produced: 2,
  purchase: 2,
  received: 3,
  delivered: 4,
};

const KEYFRAMES = `
@keyframes tmRing{0%{box-shadow:0 0 0 0 rgba(239,159,39,.35)}70%{box-shadow:0 0 0 9px rgba(239,159,39,0)}100%{box-shadow:0 0 0 0 rgba(239,159,39,0)}}
@keyframes tmPop{0%{transform:scale(.97);opacity:0}100%{transform:scale(1);opacity:1}}
@keyframes tmSlide{0%{transform:translateY(-5px);opacity:0}100%{transform:translateY(0);opacity:1}}
.tm-ring{animation:tmRing 2.4s ease-in-out infinite}
.tm-pop{animation:tmPop .5s cubic-bezier(.22,1,.36,1)}
.tm-slide{animation:tmSlide .5s cubic-bezier(.22,1,.36,1)}
`;

const shortMoney = (v: number) =>
  Math.abs(v) >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${Math.round(v)}`;

export default function TimeMachine() {
  const { data: range } = useTimeMachineRange();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [playing, setPlaying] = useState(false);

  const minDate = range ? toInput(new Date(range.earliest).getTime()) : "";
  const maxDate = range ? toInput(new Date(range.latest).getTime()) : "";

  useEffect(() => {
    if (range && !endDate) {
      const latest = new Date(range.latest).getTime();
      const earliest = new Date(range.earliest).getTime();
      setEndDate(toInput(latest));
      setStartDate(toInput(Math.max(earliest, latest - 30 * DAY)));
    }
  }, [range, endDate]);

  const startISO = startDate ? `${startDate}T00:00:00` : undefined;
  const endISO = endDate ? `${endDate}T23:59:59` : undefined;
  const spanDays =
    startDate && endDate
      ? Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / DAY) + 1)
      : 0;

  const { data: snap, isFetching } = useTimeMachineSnapshot(endISO);

  function setSpan(days: number) {
    if (!range) return;
    const end = new Date(range.latest).getTime();
    const earliest = new Date(range.earliest).getTime();
    setEndDate(toInput(end));
    setStartDate(toInput(Math.max(earliest, end - (days - 1) * DAY)));
  }

  if (!range || !startDate || !endDate) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Inventory Time Machine"
        subtitle="Replay any window as a timelapse — every order, receipt and build, with the valuation curve drawing in sync."
      />

      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Start date</label>
            <input
              type="date"
              value={startDate}
              min={minDate}
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10 rounded-md border border-teal-100 bg-white/90 px-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">End date</label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={maxDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-10 rounded-md border border-teal-100 bg-white/90 px-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Days</label>
            <input
              type="number"
              min={1}
              value={spanDays}
              onChange={(e) => setSpan(Math.max(1, Math.floor(+e.target.value || 1)))}
              className="h-10 w-24 rounded-md border border-teal-100 bg-white/90 px-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setSpan(d)}
                className="rounded-md border border-teal-200 bg-teal-50/70 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-teal-300 hover:bg-teal-100/70"
              >
                {d}d
              </button>
            ))}
          </div>
          <div className="ml-auto">
            <Button onClick={() => setPlaying(true)}>
              <Play className="h-4 w-4" /> Play timelapse
            </Button>
          </div>
        </div>
      </Card>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          icon={<Wallet className="h-5 w-5" />}
          label={`Inventory value · ${new Date(endDate).toLocaleDateString()}`}
          value={money(snap?.total_value ?? 0)}
          busy={isFetching}
        />
        <KpiCard icon={<Layers className="h-5 w-5" />} label="SKUs in stock" value={String(snap?.sku_count ?? 0)} />
        <KpiCard icon={<Boxes className="h-5 w-5" />} label="Total units" value={fmtQty(snap?.total_units ?? 0)} />
      </div>

      <Card>
        <div className="flex items-center justify-between px-5 py-4">
          <p className="text-sm font-semibold text-slate-700">Stock as of {new Date(endDate).toLocaleDateString()}</p>
          <span className="text-xs text-slate-400">{snap?.rows.length ?? 0} products</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3">SKU</th>
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3 text-right">On hand</th>
                <th className="px-5 py-3 text-right">Unit cost</th>
                <th className="px-5 py-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {(snap?.rows ?? []).map((r) => (
                <tr key={r.product_id} className="border-b border-teal-50">
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{r.sku}</td>
                  <td className="px-5 py-3 font-medium text-slate-800">{r.name}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{fmtQty(r.on_hand)} {r.uom}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-500">{money(r.unit_cost)}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-slate-900">{money(r.value)}</td>
                </tr>
              ))}
              {snap && snap.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400">
                    No stock on hand at this moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {playing && startISO && endISO && (
        <TimelapseModal startISO={startISO} endISO={endISO} onClose={() => setPlaying(false)} />
      )}
    </div>
  );
}

function TimelapseModal({ startISO, endISO, onClose }: { startISO: string; endISO: string; onClose: () => void }) {
  const { data: series } = useTimeMachineSeries(startISO, endISO);
  const { data: activity } = useTimeMachineActivity(startISO, endISO);

  const startMs = useMemo(() => new Date(startISO).getTime(), [startISO]);
  const endMs = useMemo(() => new Date(endISO).getTime(), [endISO]);
  const events = useMemo(() => activity?.events ?? [], [activity]);
  const loaded = !!series && !!activity;

  const [mode, setMode] = useState<"event" | "time">("event");
  const [stepIdx, setStepIdx] = useState(0);
  const [timeMs, setTimeMs] = useState(startMs);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [displayMs, setDisplayMs] = useState(startMs);
  const displayRef = useRef(startMs);
  const targetRef = useRef(startMs);
  const rafRef = useRef<number | undefined>(undefined);
  const lastRef = useRef<number | undefined>(undefined);

  // Reset + autoplay when data arrives or the mode changes.
  useEffect(() => {
    if (loaded) {
      setStepIdx(0);
      setTimeMs(startMs);
      displayRef.current = startMs;
      setDisplayMs(startMs);
      setIsPlaying(true);
    }
  }, [loaded, startMs, mode]);

  // Event-paced: step one event at a time at an even tempo.
  useEffect(() => {
    if (mode !== "event" || !isPlaying || !loaded) return;
    if (stepIdx >= events.length) {
      setIsPlaying(false);
      return;
    }
    // A new order's "Order placed" event gets an extra beat before it fires,
    // so each order finishes and settles before the next one begins.
    const nextIsNewOrder = stepIdx > 0 && events[stepIdx]?.kind === "placed";
    const delay = (750 + (nextIsNewOrder ? 1500 : 0)) / speed;
    const id = setTimeout(() => setStepIdx((s) => Math.min(events.length, s + 1)), delay);
    return () => clearTimeout(id);
  }, [mode, isPlaying, loaded, stepIdx, speed, events]);

  // Time-paced: advance the playhead by wall-clock time.
  useEffect(() => {
    if (mode !== "time" || !isPlaying || !loaded) return;
    lastRef.current = undefined;
    const span = Math.max(1, endMs - startMs);
    const duration = 14000 / speed;
    const tick = (now: number) => {
      if (lastRef.current == null) lastRef.current = now;
      const dt = now - lastRef.current;
      lastRef.current = now;
      setTimeMs((p) => Math.min(endMs, p + (span * dt) / duration));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mode, isPlaying, loaded, speed, startMs, endMs]);

  useEffect(() => {
    if (mode === "time" && timeMs >= endMs && isPlaying) setIsPlaying(false);
  }, [mode, timeMs, endMs, isPlaying]);

  const revealedCount =
    mode === "event" ? stepIdx : events.filter((e) => new Date(e.ts).getTime() <= timeMs).length;
  // The playhead glides toward the latest event's timestamp instead of snapping,
  // so the graph marker and value ease between events rather than jumping.
  const targetMs =
    mode === "event"
      ? stepIdx > 0
        ? new Date(events[stepIdx - 1].ts).getTime()
        : startMs
      : timeMs;
  // One persistent loop eases displayMs toward whatever the target currently is.
  // Reading the target from a ref means it's never cancelled when the target
  // changes — so it glides smoothly at 60fps and degrades to a clean snap when
  // frames are sparse, instead of stalling.
  targetRef.current = targetMs;
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastPush = 0;
    const loop = (now: number) => {
      const dt = Math.max(1, now - last);
      last = now;
      const target = targetRef.current;
      const cur = displayRef.current;
      const diff = target - cur;
      if (Math.abs(diff) > 1) {
        const k = 1 - Math.pow(0.0001, dt / 600); // ~600ms time-constant ease
        displayRef.current = cur + diff * k;
        if (now - lastPush > 40) {
          setDisplayMs(displayRef.current);
          lastPush = now;
        }
      } else if (cur !== target) {
        displayRef.current = target;
        setDisplayMs(target);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const playheadMs = displayMs;
  const revealed = events.slice(0, revealedCount);
  const latest = revealed[revealed.length - 1];

  // Scope the stage tracker to the current order (since the last "Order placed"),
  // so each order visibly fills Ordered -> Delivered, then resets for the next.
  const orderStart = useMemo(() => {
    for (let i = revealedCount - 1; i >= 0; i--) if (events[i]?.kind === "placed") return i;
    return 0;
  }, [revealedCount, events]);
  const doneSet = useMemo(() => {
    const s = new Set<number>();
    for (let i = orderStart; i < revealedCount; i++) {
      const idx = STAGE_OF[events[i].kind];
      if (idx != null) s.add(idx);
    }
    return s;
  }, [orderStart, revealedCount, events]);
  const activeIndex = useMemo(() => {
    for (let i = revealedCount - 1; i >= orderStart; i--) {
      const idx = STAGE_OF[events[i].kind];
      if (idx != null) return idx;
    }
    return -1;
  }, [orderStart, revealedCount, events]);

  const numericPoints = useMemo(
    () => (series?.points ?? []).map((p) => ({ x: new Date(p.t).getTime(), value: p.value })),
    [series]
  );
  const currentValue = useMemo(() => {
    let v = numericPoints[0]?.value ?? 0;
    for (const p of numericPoints) {
      if (p.x <= playheadMs) v = p.value;
      else break;
    }
    return v;
  }, [numericPoints, playheadMs]);
  const chartData = useMemo(
    () => numericPoints.map((p) => ({ ...p, shown: p.x <= playheadMs ? p.value : null })),
    [numericPoints, playheadMs]
  );

  const feedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = 0;
  }, [revealedCount]);

  function restart() {
    setStepIdx(0);
    setTimeMs(startMs);
    displayRef.current = startMs;
    setDisplayMs(startMs);
    setIsPlaying(true);
  }

  const total = events.length;
  const newest = revealed.slice().reverse();

  return (
    <Modal open onClose={onClose} title="Inventory timelapse" wide>
      {!loaded ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <div className="mx-auto max-w-[580px] space-y-4">
          <style>{KEYFRAMES}</style>

          {/* Readout */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-teal-700">
              <History className="h-5 w-5" />
              <span className="text-lg font-semibold tabular-nums text-slate-900">
                {new Date(playheadMs).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-4 text-right">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Value</p>
                <p className="text-base font-semibold tabular-nums text-slate-900">{money(currentValue)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Events</p>
                <p className="text-base font-semibold tabular-nums text-slate-900">
                  {revealedCount}/{total}
                </p>
              </div>
            </div>
          </div>

          {/* Transport */}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setIsPlaying((p) => !p)}>
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isPlaying ? "Pause" : "Play"}
            </Button>
            <Button size="sm" variant="ghost" onClick={restart}>
              <RotateCcw className="h-4 w-4" /> Restart
            </Button>
            <div className="flex gap-1">
              {[1, 2, 4].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-semibold transition",
                    speed === s ? "bg-teal-700 text-white" : "border border-teal-200 bg-teal-50/70 text-slate-700 hover:bg-teal-100/70"
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>
            <div className="ml-auto flex overflow-hidden rounded-md border border-teal-200">
              {(["event", "time"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-semibold transition",
                    mode === m ? "bg-teal-700 text-white" : "bg-teal-50/70 text-slate-600 hover:bg-teal-100/70"
                  )}
                >
                  {m === "event" ? "Event-paced" : "Time-paced"}
                </button>
              ))}
            </div>
          </div>

          {/* Hero: order → delivery stage tracker */}
          <OrderFlowStages activeIndex={activeIndex} doneSet={doneSet} />

          {/* NOW spotlight */}
          {latest ? (
            <div
              key={revealedCount}
              className={cn("tm-pop flex items-center gap-3 rounded-lg p-3", KIND_TONE[latest.kind] ?? "bg-slate-100 text-slate-600")}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white">
                <SpotIcon kind={latest.kind} />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Now</p>
                <p className="truncate text-sm font-semibold">{latest.label}</p>
                <p className="truncate text-xs opacity-80">{latest.detail}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 p-3 text-center text-sm text-slate-400">Press play to begin…</div>
          )}

          {/* Event feed (newest first, animates in) */}
          <div ref={feedRef} className="max-h-36 space-y-1.5 overflow-y-auto">
            {newest.map((e, idx) => (
              <FeedRow key={`${revealedCount}-${idx}`} event={e} fresh={idx === 0} />
            ))}
          </div>

          {/* Synced valuation graph */}
          <div className="rounded-lg border border-teal-100 bg-white/70 p-3">
            <p className="mb-1 text-xs font-semibold text-slate-600">Inventory value</p>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={chartData} margin={{ left: 4, right: 12, top: 6, bottom: 0 }}>
                <defs>
                  <linearGradient id="tl-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={TEAL} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6efed" />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={[startMs, endMs]}
                  tickFormatter={(x: number) => {
                    const d = new Date(x);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                  tick={{ fontSize: 11, fill: "#8fa09c" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis tickFormatter={shortMoney} tick={{ fontSize: 11, fill: "#8fa09c" }} axisLine={false} tickLine={false} width={44} />
                <Tooltip labelFormatter={(x: number) => new Date(x).toLocaleString()} formatter={(v: number) => [money(v), "Value"]} />
                <Area type="monotone" dataKey="value" stroke="#cbd5e1" strokeWidth={1} fill="none" dot={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="shown" stroke={TEAL} strokeWidth={2} fill="url(#tl-grad)" dot={false} connectNulls={false} isAnimationActive={false} />
                <ReferenceLine x={playheadMs} stroke={TEAL} strokeDasharray="4 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Modal>
  );
}

function OrderFlowStages({ activeIndex, doneSet }: { activeIndex: number; doneSet: Set<number> }) {
  const reached = Math.max(activeIndex, doneSet.size ? Math.max(...doneSet) : -1, 0);
  const fill = reached * 20; // % from the first node's centre to the reached node's centre
  return (
    <div className="rounded-lg bg-teal-50/40 px-3 pb-3 pt-5">
      <div className="relative grid grid-cols-5">
        <div className="absolute left-[10%] right-[10%] top-6 h-[3px] bg-slate-200" />
        <div className="absolute left-[10%] top-6 h-[3px] bg-teal-500 transition-[width] duration-700 ease-out" style={{ width: `${fill}%` }} />
        {STAGES.map((s, i) => {
          const status = i === activeIndex ? "active" : doneSet.has(i) ? "done" : "pending";
          return <StageNode key={i} label={s.label} Icon={s.Icon} status={status} />;
        })}
      </div>
    </div>
  );
}

function StageNode({
  label,
  Icon,
  status,
}: {
  label: string;
  Icon: typeof Circle;
  status: "done" | "active" | "pending";
}) {
  const tone =
    status === "done"
      ? "bg-emerald-100 text-emerald-700"
      : status === "active"
      ? "tm-ring bg-amber-100 text-amber-700"
      : "border border-slate-200 bg-white text-slate-300";
  return (
    <div className="relative z-10 flex flex-col items-center gap-1.5">
      <span className={cn("flex h-12 w-12 items-center justify-center rounded-full", tone)}>
        {status === "done" ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </span>
      <span
        className={cn(
          "text-center text-[11px] font-medium",
          status === "pending" ? "text-slate-400" : status === "active" ? "text-amber-700" : "text-slate-600"
        )}
      >
        {label}
      </span>
    </div>
  );
}

function SpotIcon({ kind }: { kind: string }) {
  const Icon = KIND_ICON[kind] ?? Circle;
  return <Icon className="h-5 w-5" />;
}

function FeedRow({ event, fresh }: { event: ActivityEvent; fresh: boolean }) {
  const Icon = KIND_ICON[event.kind] ?? Circle;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2",
        fresh ? "tm-slide bg-teal-50/70 ring-1 ring-teal-200" : "bg-slate-50"
      )}
    >
      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", KIND_TONE[event.kind] ?? "bg-slate-100 text-slate-500")}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">{event.label}</p>
        <p className="truncate text-xs text-slate-500">{event.detail}</p>
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
        {new Date(event.ts).toLocaleDateString([], { month: "short", day: "numeric" })}
      </span>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  busy,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  busy?: boolean;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-teal-700">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        <p className="flex items-center gap-2 text-xl font-semibold tabular-nums text-slate-900">
          {value} {busy && <Spinner className="h-3.5 w-3.5" />}
        </p>
      </div>
    </Card>
  );
}
