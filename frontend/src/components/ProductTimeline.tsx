import { useTimeline } from "@/lib/queries";
import { Modal, Spinner } from "./ui";
import { qty as fmtQty, fmtDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

const KIND_COLOR: Record<string, string> = {
  adjustment: "bg-slate-400",
  received: "bg-blue-500",
  reserved: "bg-amber-500",
  delivered: "bg-emerald-500",
  manufactured: "bg-indigo-500",
  consumed: "bg-rose-500",
  move: "bg-slate-400",
};

export function ProductTimeline({ productId, onClose }: { productId: number | null; onClose: () => void }) {
  const { data, isLoading } = useTimeline(productId ?? undefined);

  return (
    <Modal open={productId != null} onClose={onClose} title="Product audit timeline" wide>
      {isLoading || !data ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div>
          <div className="mb-5 flex items-center justify-between rounded-lg border border-teal-100 bg-teal-50 px-4 py-3">
            <p className="font-semibold text-slate-800">{data.product.name}</p>
            <div className="flex gap-5 text-sm">
              <Metric label="On hand" value={data.product.on_hand} />
              <Metric label="Reserved" value={data.product.reserved} />
              <Metric label="Free to use" value={data.product.free_to_use} highlight />
            </div>
          </div>

          {data.events.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No movements recorded yet.</p>
          ) : (
            <ol className="relative ml-2 border-l-2 border-slate-100">
              {data.events.map((ev, i) => (
                <li key={i} className="mb-5 ml-5">
                  <span
                    className={cn(
                      "absolute -left-[9px] mt-1 h-4 w-4 rounded-full ring-4 ring-white",
                      KIND_COLOR[ev.kind] ?? "bg-slate-400"
                    )}
                  />
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-700">{ev.title}</p>
                    <span
                      className={cn(
                        "font-mono text-sm font-semibold",
                        ev.qty.startsWith("-") ? "text-rose-600" : "text-emerald-600"
                      )}
                    >
                      {ev.qty}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {fmtDateTime(ev.ts)} · {ev.note || ev.source}
                    {ev.state === "reserved" && " · reserved"}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Modal>
  );
}

function Metric({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="text-right">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("font-semibold", highlight ? "text-teal-700" : "text-slate-700")}>{fmtQty(value)}</p>
    </div>
  );
}
