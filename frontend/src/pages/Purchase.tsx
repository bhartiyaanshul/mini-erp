import { useState } from "react";
import { Plus, Truck, Trash2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { usePurchase, useProducts, usePartners, useCreatePO, useReceivePO } from "@/lib/queries";
import { apiError } from "@/lib/api";
import { money, qty as fmtQty, fmtDateTime } from "@/lib/utils";
import type { PurchaseOrder } from "@/lib/types";
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

export default function Purchase() {
  const { data: orders, isLoading } = usePurchase();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);
  const live = orders?.find((o) => o.id === selected?.id) ?? null;

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        subtitle="Replenish stock from vendors. Receiving goods increases on-hand via the ledger. Some POs are auto-created by procurement."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New Purchase Order
          </Button>
        }
      />

      {isLoading ? (
        <PageLoader />
      ) : !orders?.length ? (
        <EmptyState icon={<Truck className="h-10 w-10" />} title="No purchase orders yet" hint="Create one or let procurement auto-generate it." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3">PO</th>
                  <th className="px-5 py-3">Vendor</th>
                  <th className="px-5 py-3">Origin</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} onClick={() => setSelected(o)} className="cursor-pointer border-b border-teal-100 hover:bg-teal-50/70">
                    <td className="px-5 py-3 font-medium text-slate-800">{o.name}</td>
                    <td className="px-5 py-3">{o.partner_name || "—"}</td>
                    <td className="px-5 py-3">
                      {o.origin ? <Badge className="bg-blue-50 text-blue-600">{o.origin}</Badge> : <span className="text-slate-400">Manual</span>}
                    </td>
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

      {creating && <POForm onClose={() => setCreating(false)} onCreated={(o) => setSelected(o)} />}
      {live && <PODetail order={live} onClose={() => setSelected(null)} />}
    </div>
  );
}

function POForm({ onClose, onCreated }: { onClose: () => void; onCreated: (o: PurchaseOrder) => void }) {
  const { data: vendors } = usePartners("vendor");
  const { data: products } = useProducts();
  const create = useCreatePO();
  const [partnerId, setPartnerId] = useState<number | "">("");
  const [lines, setLines] = useState<{ product_id: number | ""; qty: number }[]>([{ product_id: "", qty: 1 }]);
  const setLine = (i: number, patch: Partial<(typeof lines)[0]>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  function save() {
    if (!partnerId) return toast.error("Select a vendor");
    const valid = lines.filter((l) => l.product_id && l.qty > 0);
    if (!valid.length) return toast.error("Add at least one line");
    create.mutate(
      { partner_id: partnerId, lines: valid.map((l) => ({ product_id: l.product_id, qty: l.qty })) },
      {
        onSuccess: (o) => {
          toast.success(`${o.name} created`);
          onClose();
          onCreated(o);
        },
        onError: (e) => toast.error(apiError(e)),
      }
    );
  }

  return (
    <Modal open onClose={onClose} title="New Purchase Order" wide>
      <div className="space-y-4">
        <div>
          <Label>Vendor</Label>
          <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value ? +e.target.value : "")}>
            <option value="">— Select vendor —</option>
            {vendors?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
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
                        {p.name}
                      </option>
                    ))}
                  </Select>
                  <Input type="number" min={1} className="w-24" value={l.qty} onChange={(e) => setLine(i, { qty: +e.target.value })} />
                  <span className="w-28 text-right text-sm text-slate-500">{prod ? money(prod.cost_price * l.qty) : ""}</span>
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

function PODetail({ order, onClose }: { order: PurchaseOrder; onClose: () => void }) {
  const receive = useReceivePO();
  const canReceive = !["fully_received", "cancelled"].includes(order.state);

  return (
    <Modal open onClose={onClose} title={`${order.name} · ${order.partner_name || "Vendor"}`} wide>
      <div className="mb-4 flex items-center justify-between">
        <StateBadge state={order.state} />
        {order.origin && <Badge className="bg-blue-50 text-blue-600">Origin: {order.origin}</Badge>}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="py-2">Product</th>
            <th className="py-2 text-right">Ordered</th>
            <th className="py-2 text-right">Received</th>
            <th className="py-2 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((l) => (
            <tr key={l.id} className="border-b border-slate-50">
              <td className="py-2 font-medium text-slate-700">{l.product_name}</td>
              <td className="py-2 text-right tabular-nums">{fmtQty(l.qty)}</td>
              <td className="py-2 text-right tabular-nums text-emerald-600">{fmtQty(l.qty_received ?? 0)}</td>
              <td className="py-2 text-right tabular-nums">{money(l.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-5 flex justify-end gap-2">
        {canReceive && (
          <Button
            onClick={() =>
              receive.mutate(order.id, {
                onSuccess: (r: any) => toast.success(`${order.name} ${r.fully ? "fully" : "partially"} received`),
                onError: (e) => toast.error(apiError(e)),
              })
            }
            loading={receive.isPending}
          >
            <PackageCheck className="h-4 w-4" /> Receive goods
          </Button>
        )}
      </div>
    </Modal>
  );
}
