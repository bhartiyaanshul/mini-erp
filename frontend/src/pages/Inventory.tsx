import { useState } from "react";
import { Boxes, SlidersHorizontal, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { toast } from "sonner";
import { useProducts, useStockMoves, useAdjustStock } from "@/lib/queries";
import { useAuth } from "@/auth/AuthContext";
import { apiError } from "@/lib/api";
import { cn, fmtDateTime, qty as fmtQty, titleCase } from "@/lib/utils";
import type { Product } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Modal,
  PageHeader,
  PageLoader,
} from "@/components/ui";

export default function Inventory() {
  const { user } = useAuth();
  const canAdjust = ["admin", "inventory"].includes(user!.role);
  const { data: products, isLoading } = useProducts();
  const { data: moves } = useStockMoves();
  const [adjust, setAdjust] = useState<Product | null>(null);

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Balances are never stored — they're summed live from the immutable stock-move ledger below."
      />

      {isLoading ? (
        <PageLoader />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Stock on hand</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-3">Product</th>
                    <th className="px-5 py-3 text-right">On Hand</th>
                    <th className="px-5 py-3 text-right">Reserved</th>
                    <th className="px-5 py-3 text-right">Free to Use</th>
                    {canAdjust && <th className="px-5 py-3"></th>}
                  </tr>
                </thead>
                <tbody>
                  {products?.map((p) => (
                    <tr key={p.id} className="border-b border-teal-100 hover:bg-teal-50/70">
                      <td className="px-5 py-3 font-medium text-slate-800">{p.name}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{fmtQty(p.on_hand)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-amber-600">{fmtQty(p.reserved)}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-teal-700">{fmtQty(p.free_to_use)}</td>
                      {canAdjust && (
                        <td className="px-5 py-3 text-right">
                          <Button variant="ghost" size="sm" onClick={() => setAdjust(p)}>
                            <SlidersHorizontal className="h-4 w-4" /> Adjust
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stock ledger</CardTitle>
              <span className="text-xs text-slate-400">Every inventory movement, immutable</span>
            </CardHeader>
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-teal-50">
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-3">When</th>
                    <th className="px-5 py-3">Product</th>
                    <th className="px-5 py-3">Source</th>
                    <th className="px-5 py-3">State</th>
                    <th className="px-5 py-3 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {moves?.map((m) => (
                    <tr key={m.id} className="border-b border-slate-50">
                      <td className="px-5 py-2.5 text-slate-500">{fmtDateTime(m.created_at)}</td>
                      <td className="px-5 py-2.5 font-medium text-slate-700">{m.product_name}</td>
                      <td className="px-5 py-2.5 text-slate-500">{titleCase(m.source)}</td>
                      <td className="px-5 py-2.5">
                        <Badge className={m.state === "done" ? "bg-emerald-100 text-emerald-700" : m.state === "reserved" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}>
                          {titleCase(m.state)}
                        </Badge>
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <span className={cn("inline-flex items-center gap-1 font-mono font-semibold", m.move_type === "in" ? "text-emerald-600" : "text-rose-600")}>
                          {m.move_type === "in" ? <ArrowDownToLine className="h-3 w-3" /> : <ArrowUpFromLine className="h-3 w-3" />}
                          {m.move_type === "in" ? "+" : "−"}
                          {fmtQty(m.qty)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {adjust && <AdjustModal product={adjust} onClose={() => setAdjust(null)} />}
    </div>
  );
}

function AdjustModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const adjust = useAdjustStock();
  const [delta, setDelta] = useState(0);
  const [note, setNote] = useState("Manual adjustment");

  function save() {
    if (!delta) return toast.error("Enter a non-zero quantity");
    adjust.mutate(
      { product_id: product.id, qty: delta, note },
      {
        onSuccess: () => {
          toast.success(`Stock adjusted: ${product.name} ${delta > 0 ? "+" : ""}${delta}`);
          onClose();
        },
        onError: (e) => toast.error(apiError(e)),
      }
    );
  }

  return (
    <Modal open onClose={onClose} title={`Adjust stock · ${product.name}`}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Current on hand: <span className="font-semibold text-slate-700">{fmtQty(product.on_hand)}</span>. Use a
          positive number to add stock, negative to remove. This posts an immutable ledger move.
        </p>
        <div>
          <Label>Quantity change</Label>
          <Input type="number" value={delta} onChange={(e) => setDelta(+e.target.value)} placeholder="e.g. 50 or -10" />
        </div>
        <div>
          <Label>Note</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={adjust.isPending}>
            Post adjustment
          </Button>
        </div>
      </div>
    </Modal>
  );
}
