import { ShieldX } from "lucide-react";

export function AccessDenied() {
  return (
    <div className="flex h-[70vh] flex-col items-center justify-center text-center">
      <div className="mb-4 rounded-full bg-rose-50 p-4">
        <ShieldX className="h-10 w-10 text-rose-500" />
      </div>
      <h2 className="text-xl font-semibold text-slate-800">Access restricted</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        Your role doesn't have permission to view this module. Role-based access is enforced on every
        route — sign in as a different user to see more.
      </p>
    </div>
  );
}
