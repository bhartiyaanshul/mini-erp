import { useParams } from "react-router-dom";
import { AlertCircle, PackageSearch } from "lucide-react";
import { usePublicJourney } from "@/lib/queries";
import { OrderJourney } from "@/components/OrderJourney";
import { Spinner } from "@/components/ui";
import { fmtDateTime, qty } from "@/lib/utils";

export default function Track() {
  const { token } = useParams();
  const { data: journey, isLoading, isError } = usePublicJourney(token);

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 via-white to-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm">
            <PackageSearch className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Track your order</h1>
          {journey?.company && <p className="text-sm text-slate-500">with {journey.company}</p>}
        </div>

        <div className="rounded-2xl border border-teal-100 bg-white/90 p-6 shadow-sm backdrop-blur">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Spinner className="h-8 w-8" />
            </div>
          ) : isError || !journey ? (
            <div className="flex flex-col items-center py-12 text-center">
              <AlertCircle className="mb-3 h-10 w-10 text-slate-300" />
              <p className="font-semibold text-slate-700">Tracking link not found</p>
              <p className="mt-1 text-sm text-slate-500">
                This link may be invalid or the order no longer exists.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-slate-900">{journey.order}</p>
                  <p className="text-sm text-slate-500">For {journey.customer}</p>
                </div>
                <div className="text-right text-xs text-slate-400">
                  <p>Ordered</p>
                  <p className="font-medium text-slate-600">{fmtDateTime(journey.order_date)}</p>
                </div>
              </div>

              <OrderJourney journey={journey} />

              {journey.items && journey.items.length > 0 && (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Items</p>
                  <ul className="space-y-1.5">
                    {journey.items.map((it, i) => (
                      <li key={i} className="flex justify-between text-sm">
                        <span className="text-slate-700">{it.name}</span>
                        <span className="tabular-nums text-slate-500">×{qty(it.qty)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">Powered by Mini ERP</p>
      </div>
    </div>
  );
}
