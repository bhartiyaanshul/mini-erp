import { useMemo, useState } from "react";
import { Plus, ShoppingCart, Trash2, Zap, CheckCircle2, Truck, Factory, Calendar, Store, CircleDot, Link2 } from "lucide-react";
import { toast } from "sonner";
import {
  useSales,
  useProducts,
  usePartners,
  useCreateSale,
  useConfirmSale,
  useDeliverSale,
  useCancelSale,
  useOrderJourney,
} from "@/lib/queries";
import { api, apiError } from "@/lib/api";
import { OrderJourney } from "@/components/OrderJourney";
import { money, qty as fmtQty, fmtDateTime } from "@/lib/utils";
import type { ProcurementResult, SaleOrder } from "@/lib/types";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Label,
  Modal,
  PageHeader,
  PageLoader,
  QtyInput,
  Select,
  Spinner,
  StateBadge,
} from "@/components/ui";
import {
  DATE_PRESETS,
  GRID_COLS,
  ListToolbar,
  NoResults,
  matchesDatePreset,
  toOptions,
  useListControls,
} from "@/components/list-view";

const SALE_STATES = ["draft", "confirmed", "partially_delivered", "fully_delivered", "cancelled"];

export default function Sales() {
  const { data: orders, isLoading } = useSales();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<SaleOrder | null>(null);
  const controls = useListControls("sales");

  // Keep the selected order in sync with refreshed list data.
  const live = orders?.find((o) => o.id === selected?.id) ?? null;

  const customerOptions = useMemo(() => {
    const seen = new Map<number, string>();
    (orders ?? []).forEach((o) => seen.set(o.partner_id, o.partner_name));
    return [...seen].map(([id, name]) => ({ value: String(id), label: name }));
  }, [orders]);

  const filtered = useMemo(() => {
    const q = controls.query.trim().toLowerCase();
    return (orders ?? []).filter((o) => {
      if (q && !`${o.name} ${o.partner_name}`.toLowerCase().includes(q)) return false;
      if (controls.filters.status && o.state !== controls.filters.status) return false;
      if (controls.filters.customer && String(o.partner_id) !== controls.filters.customer) return false;
      if (!matchesDatePreset(o.order_date, controls.filters.date)) return false;
      return true;
    });
  }, [orders, controls.query, controls.filters]);

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
        <>
          <ListToolbar
            controls={controls}
            count={filtered.length}
            searchPlaceholder="Search by order # or customer…"
            filters={[
              { key: "date", label: "Date", icon: Calendar, options: DATE_PRESETS },
              { key: "customer", label: "Customers", icon: Store, options: customerOptions },
              { key: "status", label: "Statuses", icon: CircleDot, options: toOptions(SALE_STATES) },
            ]}
          />

          {!filtered.length ? (
            <NoResults onReset={controls.reset} />
          ) : controls.view === "grid" ? (
            <div className={`grid gap-3 ${GRID_COLS[controls.gridSize]}`}>
              {filtered.map((o) => (
                <SaleCard key={o.id} order={o} onClick={() => setSelected(o)} />
              ))}
            </div>
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
                    {filtered.map((o) => (
                      <tr
                        key={o.id}
                        onClick={() => setSelected(o)}
                        className="cursor-pointer border-b border-teal-100 hover:bg-teal-50/70"
                      >
                        <td className="px-5 py-3 font-medium text-slate-800">{o.name}</td>
                        <td className="px-5 py-3">
                          <span className="flex items-center gap-2">
                            <Avatar name={o.partner_name} size="xs" /> {o.partner_name}
                          </span>
                        </td>
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
        </>
      )}

      {creating && <SaleForm onClose={() => setCreating(false)} onCreated={(o) => setSelected(o)} />}
      {live && <SaleDetail order={live} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SaleCard({ order, onClick }: { order: SaleOrder; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col rounded-lg border border-teal-100 bg-white/85 p-4 text-left shadow-sm shadow-teal-950/[0.04] backdrop-blur transition hover:border-teal-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-800">{order.name}</p>
          <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-500">
            <Avatar name={order.partner_name} size="xs" /> {order.partner_name}
          </p>
        </div>
        <StateBadge state={order.state} />
      </div>
      <div className="mt-3 flex items-end justify-between border-t border-teal-50 pt-3">
        <span className="text-xs text-slate-400">{fmtDateTime(order.order_date)}</span>
        <span className="text-lg font-semibold tabular-nums text-slate-900">{money(order.total)}</span>
      </div>
    </button>
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

  const orderTotal = lines.reduce((sum, line) => {
    const product = products?.find((p) => p.id === line.product_id);
    return sum + (product ? product.sales_price * line.qty : 0);
  }, 0);

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
                          {p.name} · Free {fmtQty(p.free_to_use)} · {money(p.sales_price)}
                        </option>
                      ))}
                    </Select>
                    {prod ? (
                      <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] font-medium text-slate-500">
                        <span className="rounded bg-white/80 px-2 py-0.5">Free: {fmtQty(prod.free_to_use)}</span>
                        <span className="rounded bg-white/80 px-2 py-0.5">On hand: {fmtQty(prod.on_hand)}</span>
                        <span className="rounded bg-white/80 px-2 py-0.5">Price: {money(prod.sales_price)}</span>
                      </div>
                    ) : (
                      <p className="mt-1.5 text-xs text-slate-400">Choose a product to calculate availability and subtotal.</p>
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
                      {prod ? money(prod.sales_price * l.qty) : "—"}
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

function SaleDetail({ order, onClose }: { order: SaleOrder; onClose: () => void }) {
  const confirm = useConfirmSale();
  const deliver = useDeliverSale();
  const cancel = useCancelSale();
  const { data: journey, isLoading: journeyLoading } = useOrderJourney(order.id);
  const [procurements, setProcurements] = useState<ProcurementResult[] | null>(null);
  const [sharing, setSharing] = useState(false);

  async function shareLink() {
    setSharing(true);
    try {
      const { data } = await api.get<{ token: string; path: string }>(`/sales/${order.id}/track-link`);
      const url = `${window.location.origin}${data.path}`;
      await navigator.clipboard.writeText(url);
      toast.success("Tracking link copied — share it with your customer", { icon: <Link2 className="h-4 w-4" /> });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSharing(false);
    }
  }

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
      <div className="mb-4 flex items-center justify-between gap-3">
        <StateBadge state={order.state} />
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={shareLink} loading={sharing}>
            <Link2 className="h-4 w-4" /> Share tracking link
          </Button>
          <span className="text-sm text-slate-500">Total {money(order.total)}</span>
        </div>
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
        <div className="mt-4 space-y-2 rounded-lg border border-teal-200 bg-teal-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-teal-700">
            <Zap className="h-4 w-4" /> Procurement automation
          </p>
          {procurements.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
              {p.kind === "manufacture" ? (
                <Factory className="h-4 w-4 text-indigo-600" />
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

      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="mb-3 text-sm font-semibold text-slate-700">Order journey</p>
        {journeyLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : journey ? (
          <OrderJourney journey={journey} />
        ) : (
          <p className="text-sm text-slate-400">Journey unavailable.</p>
        )}
      </div>

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
