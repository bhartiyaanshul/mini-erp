import { useState } from "react";
import { ScrollText } from "lucide-react";
import { useAudit } from "@/lib/queries";
import { Badge, Card, EmptyState, PageHeader, PageLoader, Select } from "@/components/ui";
import { fmtDateTime, titleCase } from "@/lib/utils";

const ENTITY_FILTERS = [
  { value: "", label: "All entities" },
  { value: "sale_order", label: "Sale Orders" },
  { value: "purchase_order", label: "Purchase Orders" },
  { value: "manufacturing_order", label: "Manufacturing" },
  { value: "procurement", label: "Procurement" },
  { value: "product", label: "Products" },
];

const ACTION_COLOR: Record<string, string> = {
  created: "bg-slate-100 text-slate-600",
  confirmed: "bg-blue-100 text-blue-700",
  delivered: "bg-emerald-100 text-emerald-700",
  received: "bg-emerald-100 text-emerald-700",
  completed: "bg-emerald-100 text-emerald-700",
  auto_manufacture: "bg-indigo-100 text-indigo-700",
  auto_buy: "bg-amber-100 text-amber-700",
  price_updated: "bg-rose-100 text-rose-700",
  stock_adjusted: "bg-amber-100 text-amber-700",
  cancelled: "bg-rose-100 text-rose-700",
};

export default function Audit() {
  const [entityType, setEntityType] = useState("");
  const { data: logs, isLoading } = useAudit(entityType || undefined);

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Every significant change — who, when, and what — for end-to-end traceability."
        action={
          <Select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="w-48">
            {ENTITY_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        }
      />

      {isLoading ? (
        <PageLoader />
      ) : !logs?.length ? (
        <EmptyState icon={<ScrollText className="h-10 w-10" />} title="No audit entries" hint="Actions across the system will appear here." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3">When</th>
                  <th className="px-5 py-3">Actor</th>
                  <th className="px-5 py-3">Entity</th>
                  <th className="px-5 py-3">Action</th>
                  <th className="px-5 py-3">Detail</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-slate-50">
                    <td className="whitespace-nowrap px-5 py-3 text-slate-500">{fmtDateTime(l.created_at)}</td>
                    <td className="px-5 py-3 text-slate-600">{l.user_name || "System"}</td>
                    <td className="px-5 py-3 text-slate-500">{titleCase(l.entity_type)}</td>
                    <td className="px-5 py-3">
                      <Badge className={ACTION_COLOR[l.action] ?? "bg-slate-100 text-slate-600"}>{titleCase(l.action)}</Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{l.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
