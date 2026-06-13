import { useState } from "react";
import { Plus, Factory, CheckCircle2, PlayCircle, Boxes } from "lucide-react";
import { toast } from "sonner";
import {
  useMOs,
  useProducts,
  useCreateMO,
  useConfirmMO,
  useCompleteMO,
  useCompleteWorkOrder,
} from "@/lib/queries";
import { apiError } from "@/lib/api";
import { qty as fmtQty, fmtDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { ManufacturingOrder } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Modal,
  PageHeader,
  PageLoader,
  Select,
  StateBadge,
} from "@/components/ui";

export default function Manufacturing() {
  const { data: orders, isLoading } = useMOs();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ManufacturingOrder | null>(null);
  const live = orders?.find((o) => o.id === selected?.id) ?? null;

  return (
    <div>
      <PageHeader
        title="Manufacturing Orders"
        subtitle="Turn raw materials into finished goods. Completing an MO consumes components and produces output via the ledger."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New MO
          </Button>
        }
      />

      {isLoading ? (
        <PageLoader />
      ) : !orders?.length ? (
        <EmptyState
          icon={<Factory className="h-10 w-10" />}
          title="No manufacturing orders"
          hint="Auto-created when a sale order needs manufactured stock, or create one manually."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3">MO</th>
                  <th className="px-5 py-3">Product</th>
                  <th className="px-5 py-3 text-right">Qty</th>
                  <th className="px-5 py-3">Origin</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} onClick={() => setSelected(o)} className="cursor-pointer border-b border-teal-100 hover:bg-teal-50/70">
                    <td className="px-5 py-3 font-medium text-slate-800">{o.name}</td>
                    <td className="px-5 py-3">{o.product_name}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmtQty(o.qty)}</td>
                    <td className="px-5 py-3 text-slate-500">
                      {o.origin ? <Badge className="bg-blue-50 text-blue-600">{o.origin}</Badge> : "Manual"}
                    </td>
                    <td className="px-5 py-3">
                      <StateBadge state={o.state} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {creating && <MOForm onClose={() => setCreating(false)} />}
      {live && <MODetail mo={live} onClose={() => setSelected(null)} />}
    </div>
  );
}

function MOForm({ onClose }: { onClose: () => void }) {
  const { data: products } = useProducts();
  const create = useCreateMO();
  const manufacturable = products?.filter((p) => p.bom_id) ?? [];
  const [productId, setProductId] = useState<number | "">("");
  const [qty, setQty] = useState(1);

  function save() {
    if (!productId) return toast.error("Select a product with a BoM");
    create.mutate(
      { product_id: productId, qty },
      {
        onSuccess: () => {
          toast.success("Manufacturing order created");
          onClose();
        },
        onError: (e) => toast.error(apiError(e)),
      }
    );
  }

  return (
    <Modal open onClose={onClose} title="New Manufacturing Order">
      <div className="space-y-4">
        <div>
          <Label>Product (must have a BoM)</Label>
          <Select value={productId} onChange={(e) => setProductId(e.target.value ? +e.target.value : "")}>
            <option value="">— Select —</option>
            {manufacturable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          {manufacturable.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">No products have a BoM yet — create one in Bill of Materials.</p>
          )}
        </div>
        <div>
          <Label>Quantity</Label>
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(+e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={create.isPending}>
            Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function MODetail({ mo, onClose }: { mo: ManufacturingOrder; onClose: () => void }) {
  const confirm = useConfirmMO();
  const complete = useCompleteMO();
  const completeWO = useCompleteWorkOrder();

  const canConfirm = mo.state === "draft";
  const canComplete = mo.state === "confirmed" || mo.state === "in_progress";

  return (
    <Modal open onClose={onClose} title={`${mo.name} · ${fmtQty(mo.qty)} × ${mo.product_name}`} wide>
      <div className="mb-4 flex items-center justify-between">
        <StateBadge state={mo.state} />
        {mo.origin && <Badge className="bg-blue-50 text-blue-600">Origin: {mo.origin}</Badge>}
      </div>

      {/* BoM explosion / component reservation view */}
      <div className="mb-5">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Boxes className="h-4 w-4" /> Components ({fmtQty(mo.qty)} units)
        </p>
        {mo.components.length === 0 ? (
          <p className="text-sm text-slate-400">No BoM linked.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2">Component</th>
                <th className="py-2 text-right">Per unit</th>
                <th className="py-2 text-right">Required</th>
                <th className="py-2 text-right">Free to use</th>
              </tr>
            </thead>
            <tbody>
              {mo.components.map((c) => {
                const short = c.free_to_use < c.qty_required && mo.state !== "done";
                return (
                  <tr key={c.component_product_id} className="border-b border-slate-50">
                    <td className="py-2 font-medium text-slate-700">{c.component_name}</td>
                    <td className="py-2 text-right tabular-nums">{fmtQty(c.qty_per_unit)}</td>
                    <td className="py-2 text-right font-semibold tabular-nums text-rose-600">−{fmtQty(c.qty_required)}</td>
                    <td className={cn("py-2 text-right tabular-nums", short ? "text-rose-600 font-semibold" : "text-slate-500")}>
                      {fmtQty(c.free_to_use)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Work orders */}
      {mo.work_orders.length > 0 && (
        <div className="mb-2">
          <p className="mb-2 text-sm font-semibold text-slate-700">Work Orders</p>
          <div className="space-y-2">
            {mo.work_orders.map((wo) => (
              <div key={wo.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    {wo.sequence}. {wo.operation_name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {wo.work_center} · {wo.duration_mins} mins
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StateBadge state={wo.state} />
                  {wo.state !== "done" && canComplete && (
                    <Button variant="ghost" size="sm" onClick={() => completeWO.mutate(wo.id)} loading={completeWO.isPending}>
                      <PlayCircle className="h-4 w-4" /> Done
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        {canConfirm && (
          <Button onClick={() => confirm.mutate(mo.id, { onError: (e) => toast.error(apiError(e)) })} loading={confirm.isPending}>
            Confirm (reserve components)
          </Button>
        )}
        {canComplete && (
          <Button
            onClick={() =>
              complete.mutate(mo.id, {
                onSuccess: () => toast.success(`${mo.name} completed — ${fmtQty(mo.qty)} ${mo.product_name} produced`),
                onError: (e) => toast.error(apiError(e)),
              })
            }
            loading={complete.isPending}
          >
            <CheckCircle2 className="h-4 w-4" /> Complete MO
          </Button>
        )}
      </div>
    </Modal>
  );
}
