import { useState } from "react";
import {
  ShoppingCart,
  Truck,
  Factory,
  Clock,
  PackageCheck,
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
  CircleDollarSign,
  PackageSearch,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useDashboard, useForecast, useForecastBriefing, useActOnForecast } from "@/lib/queries";
import { useLive } from "@/lib/live";
import { Card, CardContent, CardHeader, CardTitle, PageHeader, PageLoader, Button, Badge } from "@/components/ui";
import { apiError } from "@/lib/api";
import { cn, fmtTime, money, qty as fmtQty, titleCase } from "@/lib/utils";
import type { DashboardMetrics, ForecastRow } from "@/lib/types";

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

export default function Dashboard() {
  const { data: m, isLoading } = useDashboard();
  const { events, connected } = useLive();

  if (isLoading || !m) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Operations Command Center"
        subtitle="Current demand, fulfillment exposure, procurement load, and production movement."
        action={
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold",
              connected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-teal-100 bg-teal-50 text-slate-400"
            )}
          >
            <Radio className="h-3.5 w-3.5" /> {connected ? "Live" : "Offline"}
          </span>
        }
      />

      <ControlTower m={m} connected={connected} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Stat index={0} label="Sales Orders" value={m.total_sales_orders} icon={ShoppingCart} color="text-teal-700 bg-teal-50 ring-teal-100" />
        <Stat index={1} label="Pending Deliveries" value={m.pending_deliveries} icon={Clock} color="text-amber-700 bg-amber-50 ring-amber-100" />
        <Stat index={2} label="Mfg Orders" value={m.manufacturing_orders} icon={Factory} color="text-indigo-700 bg-indigo-50 ring-indigo-100" />
        <Stat index={3} label="At Risk" value={m.delayed_orders} icon={AlertTriangle} color="text-rose-700 bg-rose-50 ring-rose-100" />
        <Stat index={4} label="Purchase Orders" value={m.total_purchase_orders} icon={Truck} color="text-emerald-700 bg-emerald-50 ring-emerald-100" />
        <Stat index={5} label="Partial Receipts" value={m.partial_receipts} icon={PackageCheck} color="text-slate-700 bg-slate-100 ring-slate-200" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Order Pipeline</CardTitle>
            <span className="text-xs text-slate-500">Counts by document state</span>
          </CardHeader>
          <CardContent>
            <PipelineChart m={m} />
          </CardContent>
        </Card>

        {/* Live automation feed */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-teal-700" /> Activity Stream
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[300px] overflow-y-auto p-0">
            {events.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                No operational events in this session yet.
              </p>
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
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <DemandMap rows={m.orchestration} />
        <AtRiskPanel rows={m.at_risk_orders} />
      </div>

      <PredictiveProcurement />
    </div>
  );
}

/* --------------------------- Control tower --------------------------- */

function ControlTower({ m, connected }: { m: DashboardMetrics; connected: boolean }) {
  const protectedValue = Math.max(0, m.inventory_value + m.open_procurement_value - m.revenue_at_risk);
  return (
    <div className="relative mb-6 overflow-hidden rounded-lg border border-teal-100 bg-white/85 shadow-sm shadow-teal-950/[0.04] backdrop-blur">
      {/* Parallax backdrop: drifting orbs at differing speeds create depth */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-drift absolute -left-16 -top-20 h-56 w-56 rounded-full bg-teal-200/40 blur-3xl" />
        <div className="animate-drift-rev absolute -bottom-24 right-8 h-64 w-64 rounded-full bg-emerald-200/30 blur-3xl" />
        <div className="animate-float-slow absolute right-1/3 top-6 h-28 w-28 rounded-full bg-teal-100/50 blur-2xl" />
      </div>
      <div className="relative z-10 grid gap-0 lg:grid-cols-[1.15fr_1fr]">
        <div className="border-b border-teal-100 p-5 lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}>
                {connected ? "Live operations" : "Offline snapshot"}
              </Badge>
              <Badge className="bg-teal-50 text-teal-700">Ledger verified</Badge>
            </div>
            <span className="text-xs font-semibold text-slate-500">Last updated now</span>
          </div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Today&apos;s operating position</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-950">Ready for review</h2>
            </div>
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-right">
              <p className="text-lg font-semibold tabular-nums text-emerald-700">{m.delayed_orders}</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700">Exceptions</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Highlight
              label="Delivery queue"
              value={m.pending_deliveries}
              hint={m.pending_deliveries ? "Needs dispatch review" : "No pending dispatch"}
              icon={Clock}
              tone="amber"
            />
            <Highlight
              label="Customer demand"
              value={m.total_sales_orders}
              hint={m.total_sales_orders ? "Orders in pipeline" : "No active sales orders"}
              icon={ShoppingCart}
              tone="brand"
            />
            <Highlight
              label="Receipt follow-up"
              value={m.partial_receipts}
              hint={m.partial_receipts ? "Partials need closure" : "Receipts are clean"}
              icon={PackageCheck}
              tone="slate"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-teal-100 sm:grid-cols-4 lg:grid-cols-2">
          <Impact label="Revenue at risk" value={money(m.revenue_at_risk)} icon={CircleDollarSign} tone="rose" />
          <Impact label="Inventory value" value={money(m.inventory_value)} icon={PackageSearch} tone="emerald" />
          <Impact label="Open procurement" value={money(m.open_procurement_value)} icon={Truck} tone="amber" />
          <Impact label="Protected flow" value={money(protectedValue)} icon={ShieldCheck} tone="blue" />
        </div>
      </div>
    </div>
  );
}

function Highlight({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  icon: any;
  tone: "amber" | "brand" | "slate";
}) {
  const tones = {
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    brand: "bg-teal-50 text-teal-700 ring-teal-100",
    slate: "bg-teal-50 text-slate-700 ring-teal-100",
  };
  return (
    <div className="rounded-lg border border-teal-100 bg-teal-50/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-md ring-1", tones[tone])}>
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-2xl font-semibold tabular-nums text-slate-950">{value}</p>
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{label}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function Impact({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: any;
  tone: "rose" | "emerald" | "amber" | "blue";
}) {
  const tones = {
    rose: "text-rose-600 bg-rose-50",
    emerald: "text-emerald-600 bg-emerald-50",
    amber: "text-amber-600 bg-amber-50",
    blue: "text-teal-700 bg-teal-50",
  };
  return (
    <div className="min-w-0 p-4">
      <div className={cn("mb-3 flex h-8 w-8 items-center justify-center rounded-md", tones[tone])}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="truncate text-lg font-semibold tabular-nums text-slate-950">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </div>
  );
}

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

/* --------------------------------- Stat tiles -------------------------------- */

function Stat({
  label,
  value,
  icon: Icon,
  color,
  index = 0,
}: {
  label: string;
  value: number;
  icon: any;
  color: string;
  index?: number;
}) {
  return (
    <Card
      className="animate-rise transition-transform duration-300 hover:-translate-y-0.5"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-md ring-1", color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums text-slate-950">{value}</p>
          <p className="text-xs font-medium text-slate-500">{label}</p>
        </div>
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
  if (data.length === 0) return <p className="py-10 text-center text-sm text-slate-500">No orders yet.</p>;
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

function eventColor(type: string): string {
  if (type.includes("procurement")) return "bg-teal-500";
  if (type.includes("completed") || type.includes("delivered") || type.includes("received")) return "bg-emerald-500";
  if (type.includes("confirmed")) return "bg-blue-500";
  if (type.includes("created")) return "bg-amber-500";
  return "bg-slate-400";
}
