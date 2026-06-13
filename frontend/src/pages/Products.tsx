import { useMemo, useState } from "react";
import { Plus, Package, Pencil, History, Factory, Truck, Layers } from "lucide-react";
import { toast } from "sonner";
import {
  useProducts,
  useBoms,
  usePartners,
  useCreateProduct,
  useUpdateProduct,
} from "@/lib/queries";
import { useAuth } from "@/auth/AuthContext";
import { canView } from "@/lib/access";
import { apiError } from "@/lib/api";
import { money, qty as fmtQty, clampMoney, MAX_PRICE } from "@/lib/utils";
import type { Product } from "@/lib/types";
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
} from "@/components/ui";
import { GRID_COLS, ListToolbar, NoResults, useListControls } from "@/components/list-view";
import { ProductTimeline } from "@/components/ProductTimeline";

const STRATEGY_OPTIONS = [
  { value: "mts", label: "Make to stock" },
  { value: "buy", label: "MTO · Buy" },
  { value: "manufacture", label: "MTO · Manufacture" },
];

function strategyKey(p: Product): string {
  if (!p.procure_on_demand) return "mts";
  return p.procurement_type === "manufacture" ? "manufacture" : "buy";
}

const blank = {
  name: "",
  sku: "",
  sales_price: 0,
  cost_price: 0,
  uom: "Units",
  procure_on_demand: false,
  procurement_type: "buy" as "buy" | "manufacture",
  default_vendor_id: null as number | null,
  bom_id: null as number | null,
};

export default function Products() {
  const { user } = useAuth();
  const canManage = canView(user!, "product");
  const { data: products, isLoading } = useProducts();
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [timelineId, setTimelineId] = useState<number | null>(null);
  const controls = useListControls("products", { defaultView: "grid" });

  const filtered = useMemo(() => {
    const q = controls.query.trim().toLowerCase();
    return (products ?? []).filter((p) => {
      if (q && !`${p.name} ${p.sku ?? ""}`.toLowerCase().includes(q)) return false;
      if (controls.filters.strategy && strategyKey(p) !== controls.filters.strategy) return false;
      return true;
    });
  }, [products, controls.query, controls.filters]);

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Central inventory model — every quantity is derived live from the stock ledger."
        action={
          canManage && (
            <Button onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> New Product
            </Button>
          )
        }
      />

      {isLoading ? (
        <PageLoader />
      ) : !products?.length ? (
        <EmptyState
          icon={<Package className="h-10 w-10" />}
          title="No products yet"
          hint="Create a product, or load the demo scenario from the top bar (as Admin)."
        />
      ) : (
        <>
          <ListToolbar
            controls={controls}
            count={filtered.length}
            searchPlaceholder="Search by name or SKU…"
            filters={[{ key: "strategy", label: "Strategies", icon: Layers, options: STRATEGY_OPTIONS }]}
          />

          {!filtered.length ? (
            <NoResults onReset={controls.reset} />
          ) : controls.view === "grid" ? (
            <div className={`grid gap-3 ${GRID_COLS[controls.gridSize]}`}>
              {filtered.map((p) => (
                <ProductCard
                  key={p.id}
                  p={p}
                  canManage={canManage}
                  onEdit={() => setEditing(p)}
                  onHistory={() => setTimelineId(p.id)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-5 py-3">Product</th>
                      <th className="px-5 py-3">Strategy</th>
                      <th className="px-5 py-3 text-right">On Hand</th>
                      <th className="px-5 py-3 text-right">Reserved</th>
                      <th className="px-5 py-3 text-right">Free to Use</th>
                      <th className="px-5 py-3 text-right">Sales Price</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.id} className="border-b border-teal-100 hover:bg-teal-50/70">
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-800">{p.name}</p>
                          <p className="text-xs text-slate-400">{p.sku || "—"}</p>
                        </td>
                        <td className="px-5 py-3">
                          <StrategyChip p={p} />
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">{fmtQty(p.on_hand)}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-amber-600">{fmtQty(p.reserved)}</td>
                        <td className="px-5 py-3 text-right font-semibold tabular-nums text-teal-700">
                          {fmtQty(p.free_to_use)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">{money(p.sales_price)}</td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" title="Audit timeline" onClick={() => setTimelineId(p.id)}>
                              <History className="h-4 w-4" />
                            </Button>
                            {canManage && (
                              <Button variant="ghost" size="icon" title="Edit" onClick={() => setEditing(p)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
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

      {editing && <ProductForm product={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      <ProductTimeline productId={timelineId} onClose={() => setTimelineId(null)} />
    </div>
  );
}

function ProductCard({
  p,
  canManage,
  onEdit,
  onHistory,
}: {
  p: Product;
  canManage: boolean;
  onEdit: () => void;
  onHistory: () => void;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-teal-100 bg-white/85 p-4 shadow-sm shadow-teal-950/[0.04] backdrop-blur transition hover:border-teal-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-800">{p.name}</p>
          <p className="text-xs text-slate-400">{p.sku || "—"}</p>
        </div>
        <StrategyChip p={p} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-md bg-teal-50/60 p-2.5 text-center">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">On hand</p>
          <p className="tabular-nums text-slate-800">{fmtQty(p.on_hand)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Reserved</p>
          <p className="tabular-nums text-amber-600">{fmtQty(p.reserved)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Free</p>
          <p className="font-semibold tabular-nums text-teal-700">{fmtQty(p.free_to_use)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-teal-50 pt-3">
        <span className="text-sm font-semibold tabular-nums text-slate-900">{money(p.sales_price)}</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" title="Audit timeline" onClick={onHistory}>
            <History className="h-4 w-4" />
          </Button>
          {canManage && (
            <Button variant="ghost" size="icon" title="Edit" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StrategyChip({ p }: { p: Product }) {
  if (!p.procure_on_demand) return <Badge className="bg-emerald-100 text-emerald-700">MTS · Stock</Badge>;
  return p.procurement_type === "manufacture" ? (
    <Badge className="bg-indigo-100 text-indigo-700">
      <Factory className="mr-1 h-3 w-3" /> MTO · Manufacture
    </Badge>
  ) : (
    <Badge className="bg-amber-100 text-amber-700">
      <Truck className="mr-1 h-3 w-3" /> MTO · Buy
    </Badge>
  );
}

function ProductForm({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const [form, setForm] = useState({ ...blank, ...(product ?? {}) });
  const { data: vendors } = usePartners("vendor");
  const { data: boms } = useBoms();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  function save() {
    if (!form.name.trim()) return toast.error("Name is required");
    const body = {
      ...form,
      sales_price: Number(form.sales_price),
      cost_price: Number(form.cost_price),
      default_vendor_id: form.procurement_type === "buy" ? form.default_vendor_id : null,
      bom_id: form.procurement_type === "manufacture" ? form.bom_id : null,
    };
    const opts = {
      onSuccess: () => {
        toast.success(product ? "Product updated" : "Product created");
        onClose();
      },
      onError: (e: unknown) => toast.error(apiError(e)),
    };
    if (product) update.mutate({ id: product.id, body }, opts);
    else create.mutate(body, opts);
  }

  return (
    <Modal open onClose={onClose} title={product ? `Edit ${product.name}` : "New Product"}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div>
            <Label>SKU</Label>
            <Input value={form.sku} onChange={(e) => set({ sku: e.target.value })} />
          </div>
          <div>
            <Label>Unit</Label>
            <Input value={form.uom} onChange={(e) => set({ uom: e.target.value })} />
          </div>
          <div>
            <Label>Sales price</Label>
            <Input type="number" min={0} max={MAX_PRICE} value={form.sales_price} onChange={(e) => set({ sales_price: clampMoney(e.target.value) })} />
          </div>
          <div>
            <Label>Cost price</Label>
            <Input type="number" min={0} max={MAX_PRICE} value={form.cost_price} onChange={(e) => set({ cost_price: clampMoney(e.target.value) })} />
          </div>
        </div>

        <div className="rounded-lg border border-teal-100 bg-teal-50/50 p-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.procure_on_demand}
              onChange={(e) => set({ procure_on_demand: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-teal-700"
            />
            <span className="text-sm font-medium text-slate-700">
              Procure on demand <span className="text-slate-400">(enables MTO automation)</span>
            </span>
          </label>

          {form.procure_on_demand && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <Label>Procurement type</Label>
                <Select
                  value={form.procurement_type}
                  onChange={(e) => set({ procurement_type: e.target.value as any })}
                >
                  <option value="buy">Buy (Purchase Order)</option>
                  <option value="manufacture">Manufacture (MO)</option>
                </Select>
              </div>
              {form.procurement_type === "buy" ? (
                <div>
                  <Label>Default vendor</Label>
                  <Select
                    value={form.default_vendor_id ?? ""}
                    onChange={(e) => set({ default_vendor_id: e.target.value ? +e.target.value : null })}
                  >
                    <option value="">— Select —</option>
                    {vendors?.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                <div>
                  <Label>Bill of Materials</Label>
                  <Select value={form.bom_id ?? ""} onChange={(e) => set({ bom_id: e.target.value ? +e.target.value : null })}>
                    <option value="">— Select —</option>
                    {boms?.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={create.isPending || update.isPending}>
            {product ? "Save changes" : "Create product"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
