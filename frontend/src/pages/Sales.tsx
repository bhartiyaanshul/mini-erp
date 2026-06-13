import { useState } from "react";
import { Plus, ShoppingCart, Trash2, Zap, CheckCircle2, Truck, Factory } from "lucide-react";
import { toast } from "sonner";
import {
  useSales,
  useProducts,
  usePartners,
  useCreateSale,
  useConfirmSale,
  useDeliverSale,
  useCancelSale,
} from "@/lib/queries";
import { apiError } from "@/lib/api";
import { money, qty as fmtQty, fmtDateTime } from "@/lib/utils";
import type { ProcurementResult, SaleOrder } from "@/lib/types";
import {
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

export default function Sales() {
  const { data: orders, isLoading } = useSales();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<SaleOrder | null>(null);

  // Keep the selected order in sync with refreshed list data.
  const live = orders?.find((o) => o.id === selected?.id) ?? null;

  return (
    <div>
      <PageHeader
        title="Sales Orders"
        subtitle="Capture customer demand. Confirming reserves stock and fires automated procurement for any shortage."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New Sale Order
          </Button>
        }
      />

      {isLoading ? (
        <PageLoader />
      ) : !orders?.length ? (
        <EmptyState icon={<ShoppingCart className="h-10 w-10" />} title="No sale orders yet" hint="Create one to get started." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3">Order</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => setSelected(o)}
                    className="cursor-pointer border-b border-slate-50 hover:bg-slate-50/60"
                  >
                    <td className="px-5 py-3 font-medium text-slate-800">{o.name}</td>
                    <td className="px-5 py-3">{o.partner_name}</td>
                    <td className="px-5 py-3 text-slate-500">{fmtDateTime(o.order_date)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{money(o.total)}</td>
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

      {creating && <SaleForm onClose={() => setCreating(false)} onCreated={(o) => setSelected(o)} />}
      {live && <SaleDetail order={live} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SaleForm({ onClose, onCreated }: { onClose: () => void; onCreated: (o: SaleOrder) => void }) {
  const { data: customers } = usePartners("customer");
  const { data: products } = useProducts();
  const create = useCreateSale();
  const [partnerId, setPartnerId] = useState<number | "">("");
  const [lines, setLines] = useState<{ product_id: number | ""; qty: number }[]>([{ product_id: "", qty: 1 }]);

  const setLine = (i: number, patch: Partial<(typeof lines)[0]>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  function save() {
    if (!partnerId) return toast.error("Select a customer");
    const valid = lines.filter((l) => l.product_id && l.qty > 0);
    if (!valid.length) return toast.error("Add at least one product line");
    create.mutate(
      { partner_id: partnerId, lines: valid.map((l) => ({ product_id: l.product_id, qty: l.qty })) },
      {
        onSuccess: (o) => {
          toast.success(`${o.name} created (draft)`);
          onClose();
          onCreated(o);
        },
        onError: (e) => toast.error(apiError(e)),
      }
    );
  }

  return (
    <Modal open onClose={onClose} title="New Sale Order" wide>
      <div className="space-y-4">
        <div>
          <Label>Customer</Label>
          <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value ? +e.target.value : "")}>
            <option value="">— Select customer —</option>
            {customers?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Lines</Label>
          <div className="space-y-2">
            {lines.map((l, i) => {
              const prod = products?.find((p) => p.id === l.product_id);
              return (
                <div key={i} className="flex items-center gap-2">
                  <Select className="flex-1" value={l.product_id} onChange={(e) => setLine(i, { product_id: e.target.value ? +e.target.value : "" })}>
                    <option value="">— Product —</option>
                    {products?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (free: {fmtQty(p.free_to_use)})
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    className="w-24"
                    value={l.qty}
                    onChange={(e) => setLine(i, { qty: +e.target.value })}
                  />
                  <span className="w-28 text-right text-sm text-slate-500">
                    {prod ? money(prod.sales_price * l.qty) : ""}
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4 text-slate-400" />
                  </Button>
                </div>
              );
            })}
          </div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setLines((ls) => [...ls, { product_id: "", qty: 1 }])}>
            <Plus className="h-4 w-4" /> Add line
          </Button>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={create.isPending}>
            Create order
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SaleDetail({ order, onClose }: { order: SaleOrder; onClose: () => void }) {
  const confirm = useConfirmSale();
  const deliver = useDeliverSale();
  const cancel = useCancelSale();
  const [procurements, setProcurements] = useState<ProcurementResult[] | null>(null);

  function doConfirm() {
    confirm.mutate(order.id, {
      onSuccess: (res) => {
        setProcurements(res.procurements);
        const autos = res.procurements.filter((p) => p.kind !== "none");
        if (autos.length) toast.success(`${autos.length} procurement action(s) triggered`, { icon: <Zap className="h-4 w-4" /> });
        else toast.success(`${order.name} confirmed — reserved from stock`);
      },
      onError: (e) => toast.error(apiError(e)),
    });
  }

  const canConfirm = order.state === "draft";
  const canDeliver = order.state === "confirmed" || order.state === "partially_delivered";
  const canCancel = order.state === "draft";

  return (
    <Modal open onClose={onClose} title={`${order.name} · ${order.partner_name}`} wide>
      <div className="mb-4 flex items-center justify-between">
        <StateBadge state={order.state} />
        <span className="text-sm text-slate-500">Total {money(order.total)}</span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="py-2">Product</th>
            <th className="py-2 text-right">Ordered</th>
            <th className="py-2 text-right">Reserved</th>
            <th className="py-2 text-right">Delivered</th>
            <th className="py-2 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((l) => (
            <tr key={l.id} className="border-b border-slate-50">
              <td className="py-2 font-medium text-slate-700">{l.product_name}</td>
              <td className="py-2 text-right tabular-nums">{fmtQty(l.qty)}</td>
              <td className="py-2 text-right tabular-nums text-amber-600">{fmtQty(l.qty_reserved ?? 0)}</td>
              <td className="py-2 text-right tabular-nums text-emerald-600">{fmtQty(l.qty_delivered ?? 0)}</td>
              <td className="py-2 text-right tabular-nums">{money(l.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {procurements && procurements.length > 0 && (
        <div className="mt-4 space-y-2 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-700">
            <Zap className="h-4 w-4" /> Procurement automation
          </p>
          {procurements.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
              {p.kind === "manufacture" ? (
                <Factory className="h-4 w-4 text-purple-600" />
              ) : p.kind === "buy" ? (
                <Truck className="h-4 w-4 text-amber-600" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-slate-400" />
              )}
              {p.message}
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        {canCancel && (
          <Button variant="outline" onClick={() => cancel.mutate(order.id, { onSuccess: onClose })} loading={cancel.isPending}>
            Cancel order
          </Button>
        )}
        {canConfirm && (
          <Button onClick={doConfirm} loading={confirm.isPending}>
            Confirm order
          </Button>
        )}
        {canDeliver && (
          <Button
            onClick={() =>
              deliver.mutate(order.id, {
                onSuccess: (r: any) => toast.success(`${order.name} ${r.fully ? "fully" : "partially"} delivered`),
                onError: (e) => toast.error(apiError(e)),
              })
            }
            loading={deliver.isPending}
          >
            <Truck className="h-4 w-4" /> Deliver
          </Button>
        )}
      </div>
    </Modal>
  );
}
