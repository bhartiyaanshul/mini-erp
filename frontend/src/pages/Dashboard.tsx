import { useState } from "react";
import {
  ShoppingCart,
  Truck,
  Factory,
  Clock,
  AlertTriangle,
  Zap,
  Radio,
  TrendingDown,
  TrendingUp,
  Minus,
  Sparkles,
  RefreshCw,
  Route,
  ArrowRight,
  PackageSearch,
  Wallet,
  ShoppingBag,
  Activity,
  BarChart3,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from "recharts";
import { useDashboard, useForecast, useForecastBriefing, useActOnForecast } from "@/lib/queries";
import { useLive } from "@/lib/live";
import { Card, CardContent, CardHeader, CardTitle, PageHeader, PageLoader, Button, Badge } from "@/components/ui";
import { apiError } from "@/lib/api";
import { cn, fmtTime, money, qty as fmtQty, titleCase } from "@/lib/utils";
import type { DashboardMetrics, ForecastRow, ProductSales, TrendPoint, WsEvent } from "@/lib/types";

const STATE_FILL: Record<string, string> = {
  draft: "#b9c5c2",
  confirmed: "#256763",
  in_progress: "#d97706",
  partially_delivered: "#d97706",
  partially_received: "#d97706",
  fully_delivered: "#059669",
  fully_received: "#059669",
  done: "#059669",
  cancelled: "#be123c",
};

// Sequential teal scale for the product ranking — darkest = top seller.
const PRODUCT_COLORS = ["#0f766e", "#0d9488", "#14b8a6", "#2dd4bf", "#5eead4", "#99f6e4"];
const SALES_COLOR = "#0d9488"; // teal
const PURCHASE_COLOR = "#d97706"; // amber

export default function Dashboard() {
  const { data: m, isLoading } = useDashboard();
  const { events, connected } = useLive();

  if (isLoading || !m) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Operations Command Center"
        subtitle="Revenue, spend, and fulfillment exposure at a glance — verified against the live ledger."
        action={<LiveBadge connected={connected} />}
      />

      {/* 1 — Money KPIs: the numbers that matter most, up top */}
      <KpiStrip m={m} />

      {/* 2 — Operational counters: compact secondary context */}
      <div className="mt-4">
        <OperationalChips m={m} />
      </div>

      {/* 3 — Core analytics: money flow + product-wise sales */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <SalesPurchaseTrend data={m.sales_purchase_trend} />
        <TopProductsChart rows={m.sales_by_product} />
      </div>

      {/* 4 — Pipeline health + revenue exposure */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <PipelineCard m={m} />
        <AtRiskPanel rows={m.at_risk_orders} />
      </div>

      {/* 5 — Live orchestration + activity */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <DemandMap rows={m.orchestration} />
        <ActivityStream events={events} />
      </div>

      {/* 6 — On-demand predictive layer */}
      <PredictiveProcurement />
    </div>
  );
}

function LiveBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold",
        connected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-teal-100 bg-teal-50 text-slate-400"
      )}
    >
      <Radio className="h-3.5 w-3.5" /> {connected ? "Live" : "Offline"}
    </span>
  );
}

/* --------------------------------- KPI strip -------------------------------- */

const KPI_TONES: Record<string, { bg: string; text: string; ring: string }> = {
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-100" },
  amber: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-100" },
  teal: { bg: "bg-teal-50", text: "text-teal-700", ring: "ring-teal-100" },
  rose: { bg: "bg-rose-50", text: "text-rose-700", ring: "ring-rose-100" },
};

function KpiStrip({ m }: { m: DashboardMetrics }) {
  const salesDelta = weeklyDelta(m.sales_purchase_trend, "sales");
  const purchaseDelta = weeklyDelta(m.sales_purchase_trend, "purchases");
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        index={0}
        label="Total Sales"
        value={money(m.total_sales_value)}
        sub="Realized revenue, ledger-verified"
        icon={Wallet}
        tone="emerald"
        spark={{ data: m.sales_purchase_trend, dataKey: "sales", color: SALES_COLOR }}
        delta={salesDelta}
      />
      <KpiCard
        index={1}
        label="Total Purchase"
        value={money(m.total_purchase_value)}
        sub="Realized procurement spend"
        icon={ShoppingBag}
        tone="amber"
        spark={{ data: m.sales_purchase_trend, dataKey: "purchases", color: PURCHASE_COLOR }}
        delta={purchaseDelta}
        deltaTone="muted"
      />
      <KpiCard
        index={2}
        label="Inventory Value"
        value={money(m.inventory_value)}
        sub="On-hand stock at cost"
        icon={PackageSearch}
        tone="teal"
        footer={`${m.po_open} open PO${m.po_open === 1 ? "" : "s"} · ${money(m.open_procurement_value)} inbound`}
      />
      <KpiCard
        index={3}
        label="Revenue at Risk"
        value={money(m.revenue_at_risk)}
        sub={`${m.delayed_orders} order${m.delayed_orders === 1 ? "" : "s"} blocked on stock`}
        icon={AlertTriangle}
        tone="rose"
        footer={m.delayed_orders ? "Needs procurement attention" : "No blocked demand"}
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  spark,
  delta,
  deltaTone = "direction",
  footer,
  index = 0,
}: {
  label: string;
  value: string;
  sub: string;
  icon: any;
  tone: keyof typeof KPI_TONES;
  spark?: { data: TrendPoint[]; dataKey: "sales" | "purchases"; color: string };
  delta?: number | null;
  deltaTone?: "direction" | "muted";
  footer?: string;
  index?: number;
}) {
  const t = KPI_TONES[tone];
  return (
    <Card
      className="animate-rise flex flex-col overflow-hidden transition-transform duration-300 hover:-translate-y-0.5"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <CardContent className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-md ring-1", t.bg, t.text, t.ring)}>
            <Icon className="h-5 w-5" />
          </div>
          {delta != null && <DeltaBadge delta={delta} tone={deltaTone} />}
        </div>
        <p className="mt-4 text-[1.7rem] font-semibold leading-none tracking-tight tabular-nums text-slate-950">
          {value}
        </p>
        <p className="mt-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
        {spark ? (
          <div className="mt-auto pt-4">
            <SparkArea data={spark.data} dataKey={spark.dataKey} color={spark.color} />
          </div>
        ) : footer ? (
          <div className="mt-auto border-t border-teal-100 pt-2.5 text-[11px] font-medium text-slate-500">
            {footer}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DeltaBadge({ delta, tone }: { delta: number; tone: "direction" | "muted" }) {
  const flat = Math.abs(delta) < 0.5;
  const up = delta >= 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const color =
    tone === "muted" || flat
      ? "bg-slate-100 text-slate-500"
      : up
        ? "bg-emerald-50 text-emerald-700"
        : "bg-rose-50 text-rose-700";
  return (
    <span
      title="Last 7 days vs previous 7 days"
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", color)}
    >
      <Icon className="h-3 w-3" />
      {flat ? "0%" : `${Math.abs(delta).toFixed(0)}%`}
    </span>
  );
}

function SparkArea({ data, dataKey, color }: { data: TrendPoint[]; dataKey: "sales" | "purchases"; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={52}>
      <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`spark-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#spark-${dataKey})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------ Operational chips --------------------------- */

function OperationalChips({ m }: { m: DashboardMetrics }) {
  const items = [
    { label: "Sales Orders", value: m.total_sales_orders, icon: ShoppingCart },
    { label: "Purchase Orders", value: m.total_purchase_orders, icon: Truck },
    { label: "Mfg Orders", value: m.manufacturing_orders, icon: Factory },
    { label: "Pending Deliveries", value: m.pending_deliveries, icon: Clock },
    { label: "At Risk", value: m.delayed_orders, icon: AlertTriangle, danger: m.delayed_orders > 0 },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((it) => (
        <div
          key={it.label}
          className="flex items-center gap-3 rounded-lg border border-teal-100 bg-white/85 px-4 py-3 shadow-sm shadow-teal-950/[0.03] backdrop-blur"
        >
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
              it.danger ? "bg-rose-50 text-rose-600" : "bg-teal-50 text-teal-700"
            )}
          >
            <it.icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight tabular-nums text-slate-900">{it.value}</p>
            <p className="truncate text-[11px] font-medium text-slate-500">{it.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- Charts ----------------------------------- */

function SalesPurchaseTrend({ data }: { data: TrendPoint[] }) {
  const hasData = data.some((d) => d.sales > 0 || d.purchases > 0);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-teal-700" /> Sales &amp; Purchase Flow
          </CardTitle>
          <span className="text-xs text-slate-500">Realized money movement · last 30 days</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-500">
          <LegendDot color={SALES_COLOR} label="Sales" />
          <LegendDot color={PURCHASE_COLOR} label="Purchases" />
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="py-16 text-center text-sm text-slate-500">No realized sales or purchases in the last 30 days yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="g-sales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SALES_COLOR} stopOpacity={0.28} />
                  <stop offset="95%" stopColor={SALES_COLOR} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g-purchases" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PURCHASE_COLOR} stopOpacity={0.24} />
                  <stop offset="95%" stopColor={PURCHASE_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6efed" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDay}
                interval="preserveStartEnd"
                minTickGap={28}
                tick={{ fontSize: 11, fill: "#8fa09c" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={compactMoney}
                width={52}
                tick={{ fontSize: 11, fill: "#8fa09c" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<MoneyTooltip />} />
              <Area type="monotone" dataKey="sales" stroke={SALES_COLOR} strokeWidth={2} fill="url(#g-sales)" />
              <Area type="monotone" dataKey="purchases" stroke={PURCHASE_COLOR} strokeWidth={2} fill="url(#g-purchases)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function TopProductsChart({ rows }: { rows: ProductSales[] }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-teal-700" /> Top Products by Sales
          </CardTitle>
          <span className="text-xs text-slate-500">Revenue contribution · last 30 days</span>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">No product sales recorded in the last 30 days yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e6efed" />
              <XAxis
                type="number"
                tickFormatter={compactMoney}
                tick={{ fontSize: 11, fill: "#8fa09c" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={116}
                tickFormatter={(v: string) => (v.length > 16 ? v.slice(0, 15) + "…" : v)}
                tick={{ fontSize: 11, fill: "#475552" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip cursor={{ fill: "#f0faf8" }} content={<ProductTooltip />} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                {rows.map((_, i) => (
                  <Cell key={i} fill={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function MoneyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-teal-100 bg-white/95 px-3 py-2 text-xs shadow-lg shadow-teal-950/10 backdrop-blur">
      <p className="mb-1.5 font-semibold text-slate-700">{fmtDay(label)}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="capitalize">{p.dataKey}</span>
          <span className="ml-3 font-semibold tabular-nums text-slate-900">{money(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

function ProductTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ProductSales;
  return (
    <div className="rounded-md border border-teal-100 bg-white/95 px-3 py-2 text-xs shadow-lg shadow-teal-950/10 backdrop-blur">
      <p className="font-semibold text-slate-800">{d.name}</p>
      <p className="mt-0.5 text-slate-500">{d.sku}</p>
      <p className="mt-1 font-semibold tabular-nums text-teal-700">
        {money(d.value)} <span className="font-normal text-slate-500">· {fmtQty(d.qty)} units</span>
      </p>
    </div>
  );
}

/* ------------------------------ Pipeline + risk ----------------------------- */

function PipelineCard({ m }: { m: DashboardMetrics }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-teal-700" /> Order Pipeline
        </CardTitle>
        <span className="text-xs text-slate-500">Counts by document state</span>
      </CardHeader>
      <CardContent>
        <PipelineChart m={m} />
      </CardContent>
    </Card>
  );
}

function PipelineChart({ m }: { m: DashboardMetrics }) {
  const data = [
    ...m.sales_by_state.filter((d) => d.count > 0).map((d) => ({ name: `SO · ${titleCase(d.state)}`, count: d.count, state: d.state })),
    ...m.mo_by_state.filter((d) => d.count > 0).map((d) => ({ name: `MO · ${titleCase(d.state)}`, count: d.count, state: d.state })),
    ...m.po_by_state.filter((d) => d.count > 0).map((d) => ({ name: `PO · ${titleCase(d.state)}`, count: d.count, state: d.state })),
  ];
  if (data.length === 0) return <p className="py-16 text-center text-sm text-slate-500">No orders yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ left: 30, right: 16 }}>
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "#8fa09c" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: "#596965" }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "#f8faf9" }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
          {data.map((d, i) => (
            <Cell key={i} fill={STATE_FILL[d.state] ?? "#8b5cf6"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function AtRiskPanel({ rows }: { rows: DashboardMetrics["at_risk_orders"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-700" /> At-Risk Deliveries
        </CardTitle>
        <span className="text-xs text-slate-500">Reason and next action</span>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No blocked customer demand right now.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <li key={row.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{row.name} · {row.customer}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.reason}</p>
                  </div>
                  <Badge className="shrink-0 bg-rose-50 text-rose-700">{money(row.revenue)}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">
                    Missing {fmtQty(row.missing_qty)}
                  </span>
                  <span className="rounded bg-teal-50 px-2 py-1 font-medium text-teal-700">{row.next_action}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ----------------------------- Demand + activity ---------------------------- */

function DemandMap({ rows }: { rows: DashboardMetrics["orchestration"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Route className="h-4 w-4 text-teal-700" /> Demand to Delivery Map
        </CardTitle>
        <span className="text-xs text-slate-500">Live dependency chain</span>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No active demand chain yet.</p>
        ) : (
          <div className="space-y-4">
            {rows.map((row) => (
              <div key={row.order} className="rounded-md border border-teal-100 bg-teal-50/70 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{row.order} · {row.customer}</p>
                    <p className="text-xs text-slate-500">{money(row.value)} demand value</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {row.nodes.map((node, i) => (
                    <div key={`${node.label}-${i}`} className="flex items-center gap-2">
                      <FlowNode node={node} />
                      {i < row.nodes.length - 1 && <ArrowRight className="h-4 w-4 text-slate-300" />}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FlowNode({ node }: { node: DashboardMetrics["orchestration"][number]["nodes"][number] }) {
  const kindColor: Record<string, string> = {
    SO: "border-teal-200 bg-teal-50 text-teal-700",
    MO: "border-indigo-200 bg-indigo-50 text-indigo-700",
    PO: "border-emerald-200 bg-emerald-50 text-emerald-700",
    OUT: "border-teal-100 bg-white/80 text-slate-700",
  };
  return (
    <div className={cn("min-w-[112px] rounded-md border px-3 py-2", kindColor[node.kind] ?? kindColor.OUT)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase">{node.kind}</span>
        <span className="text-[10px]">{titleCase(node.state)}</span>
      </div>
      <p className="mt-1 truncate text-sm font-semibold">{node.label}</p>
    </div>
  );
}

function ActivityStream({ events }: { events: WsEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-teal-700" /> Activity Stream
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-[340px] overflow-y-auto p-0">
        {events.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No operational events in this session yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {events.map((e, i) => (
              <li key={i} className="flex items-start gap-3 px-5 py-2.5">
                <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", eventColor(e.type))} />
                <div className="min-w-0">
                  <p className="text-sm text-slate-700">{e.message || titleCase(e.type)}</p>
                  <p className="text-[11px] text-slate-500">{fmtTime(e.ts)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------- Predictive procurement --------------------------- */

const URGENCY: Record<string, { dot: string; text: string; label: string }> = {
  critical: { dot: "bg-rose-500", text: "text-rose-600", label: "Critical" },
  watch: { dot: "bg-amber-500", text: "text-amber-600", label: "Watch" },
  ok: { dot: "bg-emerald-500", text: "text-emerald-600", label: "Healthy" },
};

const fmtShortDate = (s: string | null) =>
  s ? new Date(s + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

function PredictiveProcurement() {
  const [run, setRun] = useState(false);
  const { data: rows, isFetching: rowsFetching, refetch: refetchRows } = useForecast(run);
  const { data: briefingData, isLoading: briefingLoading, isFetching: briefingFetching, refetch: refetchBriefing } =
    useForecastBriefing(run);
  const act = useActOnForecast();
  const briefing = briefingData?.briefing;
  const busy = rowsFetching || briefingFetching;

  const onAct = (row: ForecastRow) =>
    act.mutate(
      { product_id: row.product_id, qty: row.suggested_qty },
      {
        onSuccess: (r: any) =>
          toast.success(r.message ?? `Replenishment created for ${row.name}`, {
            icon: <Sparkles className="h-4 w-4" />,
          }),
        onError: (e) => toast.error(apiError(e)),
      }
    );

  const rerun = () => {
    refetchRows();
    refetchBriefing();
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-teal-700" /> Predictive Procurement
          </CardTitle>
          <span className="text-xs text-slate-500">
            Demand forecast derived from ledger movement
          </span>
        </div>
        {run && (
          <Button size="sm" variant="outline" loading={busy} onClick={rerun}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!run ? (
          <div className="py-10 text-center">
            <p className="mx-auto mb-4 max-w-md text-sm text-slate-500">
              Review forecasted demand, projected stockout dates, and replenishment recommendations.
            </p>
            <Button onClick={() => setRun(true)}>
              <Sparkles className="h-4 w-4" /> Run predictive forecast
            </Button>
          </div>
        ) : (
          <>
            <BriefingBanner summary={briefing?.summary} source={briefing?.source} loading={briefingLoading} />

            {!rows ? (
              <p className="py-8 text-center text-sm text-slate-500">Analyzing ledger movement...</p>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No demand-driven products to forecast yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left">
                      <th className="px-3 py-2 font-medium">Product</th>
                      <th className="px-3 py-2 text-right font-medium">Demand/day</th>
                      <th className="px-3 py-2 text-right font-medium">Free</th>
                      <th className="px-3 py-2 text-right font-medium">Cover</th>
                      <th className="px-3 py-2 font-medium">Stockout</th>
                      <th className="px-3 py-2 text-center font-medium">Trend</th>
                      <th className="px-3 py-2 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const u = URGENCY[r.urgency] ?? URGENCY.ok;
                      const pending = act.isPending && (act.variables as any)?.product_id === r.product_id;
                      return (
                        <tr key={r.product_id} className="border-b border-teal-100 last:border-0 hover:bg-teal-50/70">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className={cn("h-2 w-2 shrink-0 rounded-full", u.dot)} title={u.label} />
                              <span className="font-medium text-slate-700">{r.name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{fmtQty(r.adu)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{fmtQty(r.free_to_use)}</td>
                          <td className={cn("px-3 py-2.5 text-right font-semibold tabular-nums", u.text)}>
                            {r.days_of_cover == null ? "—" : `${fmtQty(r.days_of_cover)}d`}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500">{fmtShortDate(r.stockout_date)}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="inline-flex justify-center">
                              <TrendIcon trend={r.trend} />
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {r.suggested_qty > 0 ? (
                              <Button
                                size="sm"
                                variant={r.urgency === "critical" ? "primary" : "outline"}
                                loading={pending}
                                onClick={() => onAct(r)}
                              >
                                {r.strategy === "manufacture" ? (
                                  <Factory className="h-3.5 w-3.5" />
                                ) : (
                                  <Truck className="h-3.5 w-3.5" />
                                )}
                                {r.strategy === "manufacture" ? "Make" : "Buy"} {fmtQty(r.suggested_qty)}
                              </Button>
                            ) : (
                              <Badge className="bg-emerald-50 text-emerald-600">Healthy</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BriefingBanner({
  summary,
  source,
  loading,
}: {
  summary?: string;
  source?: "groq" | "template";
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-teal-100 bg-teal-50/70 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/85 text-teal-700 shadow-sm">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">Procurement briefing</span>
            {!loading && source && (
              <Badge className={source === "groq" ? "bg-white/85 text-teal-700" : "bg-teal-100 text-slate-600"}>
                {source === "groq" ? "Assistant" : "Rules"}
              </Badge>
            )}
          </div>
          {loading ? (
            <div className="space-y-2">
              <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-slate-600">{summary}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TrendIcon({ trend }: { trend: ForecastRow["trend"] }) {
  if (trend === "rising") return <TrendingUp className="h-3.5 w-3.5 text-rose-500" />;
  if (trend === "falling") return <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />;
  return <Minus className="h-3.5 w-3.5 text-slate-400" />;
}

/* --------------------------------- Helpers ---------------------------------- */

const fmtDay = (s: string) =>
  new Date(s + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

function compactMoney(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `₹${Math.round(n / 1e3)}k`;
  return `₹${Math.round(n)}`;
}

function weeklyDelta(trend: TrendPoint[], key: "sales" | "purchases"): number | null {
  if (!trend || trend.length < 14) return null;
  const sum = (arr: TrendPoint[]) => arr.reduce((s, d) => s + d[key], 0);
  const last7 = sum(trend.slice(-7));
  const prev7 = sum(trend.slice(-14, -7));
  if (prev7 <= 0) return last7 > 0 ? 100 : null;
  return ((last7 - prev7) / prev7) * 100;
}

function eventColor(type: string): string {
  if (type.includes("procurement")) return "bg-teal-500";
  if (type.includes("completed") || type.includes("delivered") || type.includes("received")) return "bg-emerald-500";
  if (type.includes("confirmed")) return "bg-blue-500";
  if (type.includes("created")) return "bg-amber-500";
  return "bg-slate-400";
}
