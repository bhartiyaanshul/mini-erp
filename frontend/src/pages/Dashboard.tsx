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
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useDashboard, useLowStock } from "@/lib/queries";
import { useLive } from "@/lib/live";
import { Card, CardContent, CardHeader, CardTitle, PageHeader, PageLoader } from "@/components/ui";
import { cn, fmtTime, qty as fmtQty, titleCase } from "@/lib/utils";
import type { DashboardMetrics } from "@/lib/types";

const STATE_FILL: Record<string, string> = {
  draft: "#cbd5e1",
  confirmed: "#3b82f6",
  in_progress: "#f59e0b",
  partially_delivered: "#f59e0b",
  partially_received: "#f59e0b",
  fully_delivered: "#10b981",
  fully_received: "#10b981",
  done: "#10b981",
  cancelled: "#f43f5e",
};

export default function Dashboard() {
  const { data: m, isLoading } = useDashboard();
  const { data: lowStock } = useLowStock();
  const { events, connected } = useLive();

  if (isLoading || !m) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Operations Dashboard"
        subtitle="The connected, real-time view the business never had — updates live as orders move."
        action={
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
              connected ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
            )}
          >
            <Radio className="h-3.5 w-3.5" /> {connected ? "Live" : "Offline"}
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Sales Orders" value={m.total_sales_orders} icon={ShoppingCart} color="text-blue-600 bg-blue-50" />
        <Stat label="Pending Deliveries" value={m.pending_deliveries} icon={Clock} color="text-amber-600 bg-amber-50" />
        <Stat label="Mfg Orders" value={m.manufacturing_orders} icon={Factory} color="text-purple-600 bg-purple-50" />
        <Stat label="Delayed Orders" value={m.delayed_orders} icon={AlertTriangle} color="text-rose-600 bg-rose-50" />
        <Stat label="Purchase Orders" value={m.total_purchase_orders} icon={Truck} color="text-emerald-600 bg-emerald-50" />
        <Stat label="Partial Receipts" value={m.partial_receipts} icon={PackageCheck} color="text-slate-600 bg-slate-100" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Order pipeline</CardTitle>
            <span className="text-xs text-slate-400">Live counts by status</span>
          </CardHeader>
          <CardContent>
            <PipelineChart m={m} />
          </CardContent>
        </Card>

        {/* Live automation feed */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-brand-600" /> Live activity
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[300px] overflow-y-auto p-0">
            {events.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">
                Waiting for events… confirm a sale order to see automation fire here.
              </p>
            ) : (
              <ul className="divide-y divide-slate-50">
                {events.map((e, i) => (
                  <li key={i} className="flex items-start gap-3 px-5 py-2.5">
                    <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", eventColor(e.type))} />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700">{e.message || titleCase(e.type)}</p>
                      <p className="text-[11px] text-slate-400">{fmtTime(e.ts)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Low stock (stretch) */}
      {lowStock && lowStock.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-amber-500" /> Low free-to-use stock
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {lowStock.slice(0, 6).map((p: any) => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-2.5 font-medium text-slate-700">{p.name}</td>
                    <td className="px-5 py-2.5 text-right text-slate-400">on hand {fmtQty(p.on_hand)}</td>
                    <td className="px-5 py-2.5 text-right">
                      <span className={cn("font-semibold tabular-nums", p.free_to_use <= 0 ? "text-rose-600" : "text-amber-600")}>
                        {fmtQty(p.free_to_use)} free
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: any;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums text-slate-900">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
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
  if (data.length === 0) return <p className="py-10 text-center text-sm text-slate-400">No orders yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ left: 30, right: 16 }}>
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "#94a3b8" }} />
        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: "#64748b" }} />
        <Tooltip cursor={{ fill: "#f1f5f9" }} />
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
  if (type.includes("procurement")) return "bg-brand-500";
  if (type.includes("completed") || type.includes("delivered") || type.includes("received")) return "bg-emerald-500";
  if (type.includes("confirmed")) return "bg-blue-500";
  if (type.includes("created")) return "bg-amber-500";
  return "bg-slate-400";
}
