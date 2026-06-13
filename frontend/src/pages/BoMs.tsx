import { useState } from "react";
import { Plus, ListTree, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";
import { useBoms, useProducts, useCreateBom } from "@/lib/queries";
import { apiError } from "@/lib/api";
import { qty as fmtQty } from "@/lib/utils";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  Modal,
  PageHeader,
  PageLoader,
  QtyInput,
  Select,
} from "@/components/ui";

export default function BoMs() {
  const { data: boms, isLoading } = useBoms();
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <PageHeader
        title="Bill of Materials"
        subtitle="The recipe a product is built from — components and operations. This is what makes manufacturing and MTO automation possible."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New BoM
          </Button>
        }
      />

      {isLoading ? (
        <PageLoader />
      ) : !boms?.length ? (
        <EmptyState icon={<ListTree className="h-10 w-10" />} title="No bills of materials yet" hint="Create one to enable manufacturing for a product." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {boms.map((b) => (
            <Card key={b.id}>
              <CardHeader>
                <CardTitle>{b.product_name}</CardTitle>
                <span className="text-xs text-slate-400">{b.name}</span>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Components</p>
                  <ul className="space-y-1">
                    {b.lines.map((l) => (
                      <li key={l.id} className="flex justify-between text-sm">
                        <span className="text-slate-700">{l.component_name}</span>
                        <span className="font-medium tabular-nums text-slate-500">×{fmtQty(l.qty)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {b.operations.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Operations</p>
                    <ul className="space-y-1">
                      {b.operations.map((o) => (
                        <li key={o.id} className="flex justify-between text-sm">
                          <span className="text-slate-700">
                            {o.sequence}. {o.name} <span className="text-slate-400">· {o.work_center}</span>
                          </span>
                          <span className="flex items-center gap-1 text-slate-500">
                            <Clock className="h-3 w-3" /> {o.duration_mins}m
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {creating && <BomForm onClose={() => setCreating(false)} />}
    </div>
  );
}

function BomForm({ onClose }: { onClose: () => void }) {
  const { data: products } = useProducts();
  const create = useCreateBom();
  const [name, setName] = useState("");
  const [productId, setProductId] = useState<number | "">("");
  const [lines, setLines] = useState<{ component_product_id: number | ""; qty: number }[]>([
    { component_product_id: "", qty: 1 },
  ]);
  const [ops, setOps] = useState<{ name: string; duration_mins: number; work_center: string }[]>([
    { name: "Assembly", duration_mins: 60, work_center: "Assembly Line" },
  ]);

  function save() {
    if (!productId) return toast.error("Select the finished product");
    const validLines = lines.filter((l) => l.component_product_id && l.qty > 0);
    if (!validLines.length) return toast.error("Add at least one component");
    create.mutate(
      {
        name: name || `${products?.find((p) => p.id === productId)?.name} BoM`,
        product_id: productId,
        lines: validLines,
        operations: ops
          .filter((o) => o.name.trim())
          .map((o, i) => ({ ...o, sequence: i + 1 })),
      },
      {
        onSuccess: () => {
          toast.success("BoM created and linked to product");
          onClose();
        },
        onError: (e) => toast.error(apiError(e)),
      }
    );
  }

  return (
    <Modal open onClose={onClose} title="New Bill of Materials" wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Finished product</Label>
            <Select value={productId} onChange={(e) => setProductId(e.target.value ? +e.target.value : "")}>
              <option value="">— Select —</option>
              {products?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>BoM name (optional)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Auto from product" />
          </div>
        </div>

        <div>
          <Label>Components</Label>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  className="flex-1"
                  value={l.component_product_id}
                  onChange={(e) =>
                    setLines((ls) => ls.map((x, idx) => (idx === i ? { ...x, component_product_id: e.target.value ? +e.target.value : "" } : x)))
                  }
                >
                  <option value="">— Component —</option>
                  {products?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                <QtyInput
                  className="w-24"
                  value={l.qty}
                  onChange={(qty) => setLines((ls) => ls.map((x, idx) => (idx === i ? { ...x, qty } : x)))}
                />
                <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4 text-slate-400" />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setLines((ls) => [...ls, { component_product_id: "", qty: 1 }])}>
            <Plus className="h-4 w-4" /> Add component
          </Button>
        </div>

        <div>
          <Label>Operations</Label>
          <div className="space-y-2">
            {ops.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  placeholder="Operation"
                  value={o.name}
                  onChange={(e) => setOps((os) => os.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))}
                />
                <Input
                  className="flex-1"
                  placeholder="Work center"
                  value={o.work_center}
                  onChange={(e) => setOps((os) => os.map((x, idx) => (idx === i ? { ...x, work_center: e.target.value } : x)))}
                />
                <QtyInput
                  min={0}
                  className="w-24"
                  placeholder="mins"
                  value={o.duration_mins}
                  onChange={(duration_mins) => setOps((os) => os.map((x, idx) => (idx === i ? { ...x, duration_mins } : x)))}
                />
                <Button variant="ghost" size="icon" onClick={() => setOps((os) => os.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4 text-slate-400" />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setOps((os) => [...os, { name: "", duration_mins: 30, work_center: "" }])}>
            <Plus className="h-4 w-4" /> Add operation
          </Button>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={create.isPending}>
            Create BoM
          </Button>
        </div>
      </div>
    </Modal>
  );
}
