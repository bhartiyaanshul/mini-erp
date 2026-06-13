import { useState } from "react";
import { Plus, Package, Pencil, History, Factory, Truck } from "lucide-react";
import { toast } from "sonner";
import {
  useProducts,
  useBoms,
  usePartners,
  useCreateProduct,
  useUpdateProduct,
} from "@/lib/queries";
import { useAuth } from "@/auth/AuthContext";
import { apiError } from "@/lib/api";
import { money, qty as fmtQty } from "@/lib/utils";
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
import { ProductTimeline } from "@/components/ProductTimeline";

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
  const canManage = ["admin", "owner", "inventory"].includes(user!.role);
  const { data: products, isLoading } = useProducts();
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [timelineId, setTimelineId] = useState<number | null>(null);

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
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.sku || "—"}</p>
                    </td>
                    <td className="px-5 py-3">
                      <StrategyChip p={p} />
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmtQty(p.on_hand)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-amber-600">{fmtQty(p.reserved)}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums text-brand-600">
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

      {editing && <ProductForm product={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      <ProductTimeline productId={timelineId} onClose={() => setTimelineId(null)} />
    </div>
  );
}

function StrategyChip({ p }: { p: Product }) {
  if (!p.procure_on_demand) return <Badge className="bg-emerald-100 text-emerald-700">MTS · Stock</Badge>;
  return p.procurement_type === "manufacture" ? (
    <Badge className="bg-purple-100 text-purple-700">
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
            <Input type="number" value={form.sales_price} onChange={(e) => set({ sales_price: +e.target.value })} />
          </div>
          <div>
            <Label>Cost price</Label>
            <Input type="number" value={form.cost_price} onChange={(e) => set({ cost_price: +e.target.value })} />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.procure_on_demand}
              onChange={(e) => set({ procure_on_demand: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
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
