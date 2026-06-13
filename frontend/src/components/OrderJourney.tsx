import {
  Circle,
  ClipboardCheck,
  Factory,
  Package,
  ShoppingCart,
  Truck,
  XCircle,
  Zap,
} from "lucide-react";
import type { JourneyStep, OrderJourney as Journey } from "@/lib/types";
import { cn, fmtDateTime, titleCase } from "@/lib/utils";

const ICONS: Record<string, typeof Circle> = {
  placed: ShoppingCart,
  received: ShoppingCart,
  confirmed: ClipboardCheck,
  sourcing: Zap,
  fulfilment: Factory,
  preparing: Factory,
  ready: Package,
  delivered: Truck,
  cancelled: XCircle,
};

const DOT: Record<string, string> = {
  done: "bg-emerald-100 text-emerald-700",
  current: "bg-amber-100 text-amber-700 ring-4 ring-amber-100",
  pending: "bg-slate-100 text-slate-400",
};

function StepIcon({ stepKey }: { stepKey: string }) {
  const Icon = ICONS[stepKey] ?? Circle;
  return <Icon className="h-4 w-4" />;
}

function Step({ step, last }: { step: JourneyStep; last: boolean }) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            DOT[step.status],
            step.status === "current" && "animate-pulse"
          )}
        >
          <StepIcon stepKey={step.key} />
        </span>
        {!last && (
          <span className={cn("my-1 w-px flex-1", step.status === "done" ? "bg-emerald-200" : "bg-slate-200")} />
        )}
      </div>
      <div className={cn("min-w-0", last ? "pb-0" : "pb-5")}>
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("text-sm font-semibold", step.status === "pending" ? "text-slate-400" : "text-slate-800")}>
            {step.label}
          </p>
          {step.auto && (
            <span className="inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
              <Zap className="h-3 w-3" /> Automatic
            </span>
          )}
        </div>
        {step.detail && <p className="mt-0.5 text-xs text-slate-500">{step.detail}</p>}
        {step.docs && step.docs.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {step.docs.map((d) => (
              <span
                key={d.name}
                className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
              >
                {d.name} · {titleCase(d.state)}
              </span>
            ))}
          </div>
        )}
        {step.ts && <p className="mt-1 text-[11px] text-slate-400">{fmtDateTime(step.ts)}</p>}
      </div>
    </li>
  );
}

export function OrderJourney({ journey, showHeader = true }: { journey: Journey; showHeader?: boolean }) {
  const cancelled = journey.status_label === "Cancelled";
  const complete = journey.percent >= 100;
  const pill = cancelled
    ? "bg-rose-100 text-rose-700"
    : complete
    ? "bg-emerald-100 text-emerald-700"
    : "bg-amber-100 text-amber-700";
  const bar = cancelled ? "bg-rose-500" : complete ? "bg-emerald-500" : "bg-teal-500";

  return (
    <div>
      {showHeader && (
        <div className="mb-4">
          <div className="flex items-center justify-between gap-3">
            <span className={cn("inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold", pill)}>
              {journey.status_label}
            </span>
            <span className="text-xs font-semibold tabular-nums text-slate-500">{journey.percent}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${journey.percent}%` }} />
          </div>
          {journey.promise_date && !complete && !cancelled && (
            <p className="mt-2 text-xs text-slate-500">Promised by {fmtDateTime(journey.promise_date)}</p>
          )}
        </div>
      )}
      <ol>
        {journey.steps.map((s, i) => (
          <Step key={s.key + i} step={s} last={i === journey.steps.length - 1} />
        ))}
      </ol>
    </div>
  );
}
