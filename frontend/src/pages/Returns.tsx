import { useMemo, useState } from "react";
import {
  Plus,
  RotateCcw,
  Calendar,
  Store,
  CircleDot,
  Coins,
  PackageCheck,
  ArchiveRestore,
  Recycle,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  useReturns,
  useReturnableOrders,
  useCreateReturn,
  useProcessReturn,
  useCancelReturn,
} from "@/lib/queries";
import { apiError } from "@/lib/api";
import { money, qty as fmtQty, fmtDateTime } from "@/lib/utils";
import type { CustomerReturn, ReturnableOrder } from "@/lib/types";
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
  Textarea,
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

const RETURN_STATES = ["draft", "completed", "cancelled"];

export default function Returns() {
  const { data: returns, isLoading } = useReturns();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<CustomerReturn | null>(null);
  const controls = useListControls("returns");

  // Keep the open detail in sync with refreshed list data.
  const live = returns?.find((r) => r.id === selected?.id) ?? null;

  const customerOptions = useMemo(() => {
    const seen = new Map<number, string>();
    (returns ?? []).forEach((r) => seen.set(r.partner_id, r.partner_name));
    return [...seen].map(([id, name]) => ({ value: String(id), label: name }));
  }, [returns]);

  const filtered = useMemo(() => {
    const q = controls.query.trim().toLowerCase();
    return (returns ?? []).filter((r) => {
      if (q && !`${r.name} ${r.partner_name} ${r.sale_order_name ?? ""}`.toLowerCase().includes(q)) return false;
      if (controls.filters.status && r.state !== controls.filters.status) return false;
      if (controls.filters.customer && String(r.partner_id) !== controls.filters.customer) return false;
      if (!matchesDatePreset(r.created_at, controls.filters.date)) return false;
      return true;
    });
  }, [returns, controls.query, controls.filters]);

  return (
    <div>
      <PageHeader
        title="Returns / RMA"
        subtitle="Take goods back against a delivered order — restock or scrap each unit and issue the customer's credit. Every reverse move lands on the same stock ledger."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New Return
          </Button>
        }
      />

      {isLoading ? (
        <PageLoader />
      ) : !returns?.length ? (
        <EmptyState
          icon={<RotateCcw className="h-10 w-10" />}
          title="No returns yet"
          hint="Deliver a sale order, then record a customer return against it."
        />
      ) : (
        <>
          <ListToolbar
            controls={controls}
            count={filtered.length}
            searchPlaceholder="Search by RMA #, customer or order…"
            filters={[
              { key: "date", label: "Date", icon: Calendar, options: DATE_PRESETS },
              { key: "customer", label: "Customers", icon: Store, options: customerOptions },
              { key: "status", label: "Statuses", icon: CircleDot, options: toOptions(RETURN_STATES) },
            ]}
          />

          {!filtered.length ? (
            <NoResults onReset={controls.reset} />
          ) : controls.view === "grid" ? (
            <div className={`grid gap-3 ${GRID_COLS[controls.gridSize]}`}>
              {filtered.map((r) => (
                <ReturnCard key={r.id} ret={r} onClick={() => setSelected(r)} />
              ))}
            </div>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-5 py-3">Return</th>
                      <th className="px-5 py-3">Customer</th>
                      <th className="px-5 py-3">Against</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3 text-right">Credit</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setSelected(r)}
                        className="cursor-pointer border-b border-teal-100 hover:bg-teal-50/70"
                      >
                        <td className="px-5 py-3 font-medium text-slate-800">{r.name}</td>
                        <td className="px-5 py-3">
                          <span className="flex items-center gap-2">
                            <Avatar name={r.partner_name} size="xs" /> {r.partner_name}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-slate-500">{r.sale_order_name ?? "—"}</td>
                        <td className="px-5 py-3 text-slate-500">{fmtDateTime(r.created_at)}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{money(r.credit_total)}</td>
                        <td className="px-5 py-3">
                          <StateBadge state={r.state} />
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

      {creating && <ReturnForm onClose={() => setCreating(false)} onCreated={(r) => setSelected(r)} />}
      {live && <ReturnDetail ret={live} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ReturnCard({ ret, onClick }: { ret: CustomerReturn; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col rounded-lg border border-teal-100 bg-white/85 p-4 text-left shadow-sm shadow-teal-950/[0.04] backdrop-blur transition hover:border-teal-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-800">{ret.name}</p>
          <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-500">
            <Avatar name={ret.partner_name} size="xs" /> {ret.partner_name}
          </p>
        </div>
        <StateBadge state={ret.state} />
      </div>
      <p className="mt-2 truncate text-xs text-slate-400">Against {ret.sale_order_name ?? "—"}</p>
      <div className="mt-3 flex items-end justify-between border-t border-teal-50 pt-3">
        <span className="text-xs text-slate-400">{fmtDateTime(ret.created_at)}</span>
        <span className="text-right">
          <span className="block text-[10px] uppercase tracking-wide text-slate-400">Credit</span>
          <span className="text-lg font-semibold tabular-nums text-slate-900">{money(ret.credit_total)}</span>
        </span>
      </div>
    </button>
  );
}

type ReturnRow = {
  sale_order_line_id: number;
  product_name: string;
  unit_price: number;
  returnable: number;
  qty: number;
  scrap: number;
};

function ReturnForm({ onClose, onCreated }: { onClose: () => void; onCreated: (r: CustomerReturn) => void }) {
  const { data: orders, isLoading } = useReturnableOrders();
  const create = useCreateReturn();
  const [orderId, setOrderId] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState<ReturnRow[]>([]);

  const order = orders?.find((o) => o.id === orderId) ?? null;

  function selectOrder(id: number | "") {
    setOrderId(id);
    const o = orders?.find((x) => x.id === id) ?? null;
    setRows(
      (o?.lines ?? []).map((l) => ({
        sale_order_line_id: l.sale_order_line_id,
        product_name: l.product_name,
        unit_price: l.unit_price,
        returnable: l.returnable,
        qty: 0,
        scrap: 0,
      }))
    );
  }

  // Clamp so a row never returns more than is returnable, nor scraps more than it returns.
  const setRow = (i: number, patch: Partial<ReturnRow>) =>
    setRows((rs) =>
      rs.map((r, idx) => {
        if (idx !== i) return r;
        const next = { ...r, ...patch };
        next.qty = Math.min(Math.max(0, next.qty), next.returnable);
        next.scrap = Math.min(Math.max(0, next.scrap), next.qty);
        return next;
      })
    );

  const creditTotal = rows.reduce((sum, r) => sum + (r.qty > 0 ? r.qty * r.unit_price : 0), 0);
  const anyQty = rows.some((r) => r.qty > 0);

  function save() {
    if (!orderId) return toast.error("Select an order to return against");
    const lines = rows
      .filter((r) => r.qty > 0)
      .map((r) => ({ sale_order_line_id: r.sale_order_line_id, qty: r.qty, qty_scrap: r.scrap }));
    if (!lines.length) return toast.error("Set a return quantity on at least one line");
    create.mutate(
      { sale_order_id: orderId, reason, lines },
      {
        onSuccess: (r) => {
          toast.success(`${r.name} created (draft) — review and process to post the credit`);
          onClose();
          onCreated(r);
        },
        onError: (e) => toast.error(apiError(e)),
      }
    );
  }

  return (
    <Modal open onClose={onClose} title="New Return" wide>
      <div className="space-y-4">
        <div>
          <Label>Original order</Label>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : !orders?.length ? (
            <p className="rounded-md border border-dashed border-teal-200 bg-teal-50/40 px-3 py-3 text-sm text-slate-500">
              No delivered orders are currently eligible for return.
            </p>
          ) : (
            <Select value={orderId} onChange={(e) => selectOrder(e.target.value ? +e.target.value : "")}>
              <option value="">— Select a delivered order —</option>
              {orders.map((o: ReturnableOrder) => (
                <option key={o.id} value={o.id}>
                  {o.name} · {o.partner_name}
                </option>
              ))}
            </Select>
          )}
        </div>

        {order && (
          <div>
            <Label>Lines to return</Label>
            <div className="rounded-lg border border-teal-100 bg-teal-50/40">
              <div className="hidden grid-cols-[minmax(0,1fr)_96px_96px_110px] gap-3 border-b border-teal-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 md:grid">
                <span>Product</span>
                <span className="text-right">Return</span>
                <span className="text-right">Scrap</span>
                <span className="text-right">Credit</span>
              </div>
              {rows.map((r, i) => (
                <div
                  key={r.sale_order_line_id}
                  className="grid gap-3 border-b border-teal-100 p-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_96px_96px_110px] md:items-start"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">{r.product_name}</p>
                    <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] font-medium text-slate-500">
                      <span className="rounded bg-white/80 px-2 py-0.5">Returnable: {fmtQty(r.returnable)}</span>
                      <span className="rounded bg-white/80 px-2 py-0.5">Price: {money(r.unit_price)}</span>
                      {r.qty > 0 && (
                        <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">
                          Restock: {fmtQty(r.qty - r.scrap)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="mb-1 block text-xs font-semibold text-slate-500 md:hidden">Return qty</span>
                    <QtyInput
                      className="md:!w-24 md:text-right"
                      min={0}
                      max={r.returnable}
                      value={r.qty}
                      onChange={(qty) => setRow(i, { qty })}
                    />
                  </div>

                  <div>
                    <span className="mb-1 block text-xs font-semibold text-slate-500 md:hidden">Scrap qty</span>
                    <QtyInput
                      className="md:!w-24 md:text-right"
                      min={0}
                      max={r.qty}
                      value={r.scrap}
                      onChange={(scrap) => setRow(i, { scrap })}
                    />
                  </div>

                  <div className="min-w-0 text-left md:pt-2 md:text-right">
                    <span className="mb-1 block text-xs font-semibold text-slate-500 md:hidden">Credit</span>
                    <span className="block break-words text-sm font-semibold tabular-nums text-slate-700">
                      {r.qty > 0 ? money(r.qty * r.unit_price) : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Returned units come back into stock; the portion you scrap is written off in the same posting.
            </p>
          </div>
        )}

        {order && (
          <div>
            <Label>Reason (optional)</Label>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Damaged in transit, wrong item shipped…"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="rounded-md border border-teal-100 bg-white/80 px-3 py-2 text-sm">
            <span className="mr-3 text-slate-500">Credit note</span>
            <span className="font-semibold tabular-nums text-slate-900">{money(creditTotal)}</span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} loading={create.isPending} disabled={!order || !anyQty}>
              Create return
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ReturnDetail({ ret, onClose }: { ret: CustomerReturn; onClose: () => void }) {
  const process = useProcessReturn();
  const cancel = useCancelReturn();
  const isDraft = ret.state === "draft";

  const totals = ret.lines.reduce(
    (acc, l) => {
      acc.returned += l.qty;
      acc.restock += l.qty_restock;
      acc.scrap += l.qty_scrap;
      return acc;
    },
    { returned: 0, restock: 0, scrap: 0 }
  );

  function doProcess() {
    process.mutate(ret.id, {
      onSuccess: (res: any) =>
        toast.success(
          `${ret.name} processed — ${fmtQty(res.restocked)} restocked, ${fmtQty(res.scrapped)} scrapped · credit ${money(
            res.credit
          )}`,
          { icon: <PackageCheck className="h-4 w-4" /> }
        ),
      onError: (e) => toast.error(apiError(e)),
    });
  }

  return (
    <Modal open onClose={onClose} title={`${ret.name} · ${ret.partner_name}`} wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <StateBadge state={ret.state} />
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
            <FileText className="h-4 w-4 text-slate-400" /> Against {ret.sale_order_name ?? "—"}
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Coins className="h-4 w-4 text-amber-500" /> Credit {money(ret.credit_total)}
        </span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="py-2">Product</th>
            <th className="py-2 text-right">Returned</th>
            <th className="py-2 text-right">Restocked</th>
            <th className="py-2 text-right">Scrapped</th>
            <th className="py-2 text-right">Unit</th>
            <th className="py-2 text-right">Credit</th>
          </tr>
        </thead>
        <tbody>
          {ret.lines.map((l) => (
            <tr key={l.id} className="border-b border-slate-50">
              <td className="py-2 font-medium text-slate-700">{l.product_name}</td>
              <td className="py-2 text-right tabular-nums">{fmtQty(l.qty)}</td>
              <td className="py-2 text-right tabular-nums text-emerald-600">{fmtQty(l.qty_restock)}</td>
              <td className="py-2 text-right tabular-nums text-rose-500">{fmtQty(l.qty_scrap)}</td>
              <td className="py-2 text-right tabular-nums text-slate-500">{money(l.unit_price)}</td>
              <td className="py-2 text-right tabular-nums">{money(l.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Returned" value={fmtQty(totals.returned)} icon={<RotateCcw className="h-4 w-4 text-slate-400" />} />
        <Stat
          label="Restocked"
          value={fmtQty(totals.restock)}
          icon={<ArchiveRestore className="h-4 w-4 text-emerald-500" />}
        />
        <Stat label="Scrapped" value={fmtQty(totals.scrap)} icon={<Recycle className="h-4 w-4 text-rose-500" />} />
        <Stat label="Credit note" value={money(ret.credit_total)} icon={<Coins className="h-4 w-4 text-amber-500" />} />
      </div>

      {ret.reason && (
        <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-sm text-slate-600">
          <span className="font-semibold text-slate-700">Reason: </span>
          {ret.reason}
        </div>
      )}

      {isDraft ? (
        <p className="mt-4 text-xs text-slate-400">
          Processing posts the reverse stock moves (restock in, scrap out) and finalizes the credit. This can't be undone.
        </p>
      ) : ret.processed_at ? (
        <p className="mt-4 text-xs text-slate-400">Processed {fmtDateTime(ret.processed_at)}.</p>
      ) : null}

      {isDraft && (
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => cancel.mutate(ret.id, { onSuccess: onClose, onError: (e) => toast.error(apiError(e)) })}
            loading={cancel.isPending}
          >
            Cancel return
          </Button>
          <Button onClick={doProcess} loading={process.isPending}>
            <PackageCheck className="h-4 w-4" /> Process return
          </Button>
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-teal-100 bg-white/80 px-3 py-2">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {icon} {label}
      </span>
      <span className="mt-0.5 block text-base font-semibold tabular-nums text-slate-800">{value}</span>
    </div>
  );
}
