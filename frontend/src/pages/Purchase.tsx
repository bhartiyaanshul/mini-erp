import { useMemo, useState } from "react";
import { Plus, Truck, Trash2, PackageCheck, Building2, CircleDot, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { usePurchase, useProducts, usePartners, useCreatePO, useReceivePO } from "@/lib/queries";
import { apiError } from "@/lib/api";
import { money, qty as fmtQty, fmtDateTime } from "@/lib/utils";
import type { PurchaseOrder } from "@/lib/types";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Label,
  Modal,
  PageHeader,
  PageLoader,
  QtyInput,
  Select,
  StateBadge,
} from "@/components/ui";
import { GRID_COLS, ListToolbar, NoResults, toOptions, useListControls } from "@/components/list-view";

const PO_STATES = ["draft", "confirmed", "partially_received", "fully_received", "cancelled"];

export default function Purchase() {
  const { data: orders, isLoading } = usePurchase();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);
  const live = orders?.find((o) => o.id === selected?.id) ?? null;
  const controls = useListControls("purchase");

  const vendorOptions = useMemo(() => {
    const seen = new Map<number, string>();
    (orders ?? []).forEach((o) => o.partner_id && seen.set(o.partner_id, o.partner_name || "Vendor"));
    return [...seen].map(([id, name]) => ({ value: String(id), label: name }));
  }, [orders]);

  const filtered = useMemo(() => {
    const q = controls.query.trim().toLowerCase();
    return (orders ?? []).filter((o) => {
      if (q && !`${o.name} ${o.partner_name ?? ""} ${o.origin ?? ""}`.toLowerCase().includes(q)) return false;
      if (controls.filters.status && o.state !== controls.filters.status) return false;
      if (controls.filters.vendor && String(o.partner_id) !== controls.filters.vendor) return false;
      if (controls.filters.origin === "auto" && !o.origin) return false;
      if (controls.filters.origin === "manual" && o.origin) return false;
      return true;
    });
  }, [orders, controls.query, controls.filters]);

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
        <>
          <ListToolbar
            controls={controls}
            count={filtered.length}
            searchPlaceholder="Search by PO # or vendor…"
            filters={[
              { key: "vendor", label: "Vendors", icon: Building2, options: vendorOptions },
              {
                key: "origin",
                label: "Origins",
                icon: GitBranch,
                options: [
                  { value: "auto", label: "Auto-procured" },
                  { value: "manual", label: "Manual" },
                ],
              },
              { key: "status", label: "Statuses", icon: CircleDot, options: toOptions(PO_STATES) },
            ]}
          />

          {!filtered.length ? (
            <NoResults onReset={controls.reset} />
          ) : controls.view === "grid" ? (
            <div className={`grid gap-3 ${GRID_COLS[controls.gridSize]}`}>
              {filtered.map((o) => (
                <POCard key={o.id} order={o} onClick={() => setSelected(o)} />
              ))}
            </div>
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
                    {filtered.map((o) => (
                      <tr key={o.id} onClick={() => setSelected(o)} className="cursor-pointer border-b border-teal-100 hover:bg-teal-50/70">
                        <td className="px-5 py-3 font-medium text-slate-800">{o.name}</td>
                        <td className="px-5 py-3">
                          {o.partner_name ? (
                            <span className="flex items-center gap-2">
                              <Avatar name={o.partner_name} size="xs" /> {o.partner_name}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
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
        </>
      )}

      {creating && <POForm onClose={() => setCreating(false)} onCreated={(o) => setSelected(o)} />}
      {live && <PODetail order={live} onClose={() => setSelected(null)} />}
    </div>
  );
}

function POCard({ order, onClick }: { order: PurchaseOrder; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col rounded-lg border border-teal-100 bg-white/85 p-4 text-left shadow-sm shadow-teal-950/[0.04] backdrop-blur transition hover:border-teal-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-800">{order.name}</p>
          <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-500">
            <Avatar name={order.partner_name || "Vendor"} size="xs" /> {order.partner_name || "Vendor"}
          </p>
        </div>
        <StateBadge state={order.state} />
      </div>
      <div className="mt-3 flex items-end justify-between border-t border-teal-50 pt-3">
        {order.origin ? <Badge className="bg-blue-50 text-blue-600">{order.origin}</Badge> : <span className="text-xs text-slate-400">Manual</span>}
        <span className="text-lg font-semibold tabular-nums text-slate-900">{money(order.total)}</span>
      </div>
    </button>
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

  const orderTotal = lines.reduce((sum, line) => {
    const product = products?.find((p) => p.id === line.product_id);
    return sum + (product ? product.cost_price * line.qty : 0);
  }, 0);

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
          <div className="rounded-lg border border-teal-100 bg-teal-50/40">
            <div className="hidden grid-cols-[minmax(0,1fr)_112px_120px_40px] gap-3 border-b border-teal-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 md:grid">
              <span>Product</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Subtotal</span>
              <span />
            </div>
            {lines.map((l, i) => {
              const prod = products?.find((p) => p.id === l.product_id);
              return (
                <div
                  key={i}
                  className="grid gap-3 border-b border-teal-100 p-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_112px_120px_40px] md:items-start"
                >
                  <div className="min-w-0">
                    <Select
                      className="min-w-0"
                      value={l.product_id}
                      onChange={(e) => setLine(i, { product_id: e.target.value ? +e.target.value : "" })}
                    >
                      <option value="">Select product</option>
                      {products?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · On hand {fmtQty(p.on_hand)} · {money(p.cost_price)}
                        </option>
                      ))}
                    </Select>
                    {prod ? (
                      <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] font-medium text-slate-500">
                        <span className="rounded bg-white/80 px-2 py-0.5">On hand: {fmtQty(prod.on_hand)}</span>
                        <span className="rounded bg-white/80 px-2 py-0.5">Reserved: {fmtQty(prod.reserved)}</span>
                        <span className="rounded bg-white/80 px-2 py-0.5">Cost: {money(prod.cost_price)}</span>
                      </div>
                    ) : (
                      <p className="mt-1.5 text-xs text-slate-400">Choose a product to calculate the line subtotal.</p>
                    )}
                  </div>

                  <div>
                    <span className="mb-1 block text-xs font-semibold text-slate-500 md:hidden">Qty</span>
                    <QtyInput
                      className="md:!w-28 md:text-right"
                      value={l.qty}
                      onChange={(qty) => setLine(i, { qty })}
                    />
                  </div>

                  <div className="min-w-0 text-left md:pt-2 md:text-right">
                    <span className="mb-1 block text-xs font-semibold text-slate-500 md:hidden">Subtotal</span>
                    <span className="block break-words text-sm font-semibold tabular-nums text-slate-700">
                      {prod ? money(prod.cost_price * l.qty) : "—"}
                    </span>
                  </div>

                  <div className="flex justify-end md:pt-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Remove line"
                      disabled={lines.length === 1}
                      onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4 text-slate-400" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, { product_id: "", qty: 1 }])}>
              <Plus className="h-4 w-4" /> Add line
            </Button>
            <div className="rounded-md border border-teal-100 bg-white/80 px-3 py-2 text-sm">
              <span className="mr-3 text-slate-500">Order total</span>
              <span className="font-semibold tabular-nums text-slate-900">{money(orderTotal)}</span>
            </div>
          </div>
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
