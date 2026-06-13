import { useMemo, useState } from "react";
import { Plus, Users, Building2, Store, Tag, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { usePartners, useCreatePartner } from "@/lib/queries";
import { apiError } from "@/lib/api";
import type { Partner } from "@/lib/types";
import {
  Avatar,
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

const TYPE_META: Record<string, { label: string; color: string; icon: any }> = {
  customer: { label: "Customer", color: "bg-blue-100 text-blue-700", icon: Store },
  vendor: { label: "Vendor", color: "bg-amber-100 text-amber-700", icon: Building2 },
  both: { label: "Customer & Vendor", color: "bg-indigo-100 text-indigo-700", icon: Users },
};

const TYPE_OPTIONS = [
  { value: "customer", label: "Customers" },
  { value: "vendor", label: "Vendors" },
  { value: "both", label: "Both" },
];

export default function Partners() {
  const { data: partners, isLoading } = usePartners();
  const [creating, setCreating] = useState(false);
  const controls = useListControls("partners");

  const filtered = useMemo(() => {
    const q = controls.query.trim().toLowerCase();
    return (partners ?? []).filter((p) => {
      if (q && !`${p.name} ${p.email ?? ""} ${p.phone ?? ""}`.toLowerCase().includes(q)) return false;
      if (controls.filters.type && p.type !== controls.filters.type) return false;
      return true;
    });
  }, [partners, controls.query, controls.filters]);

  return (
    <div>
      <PageHeader
        title="Partners"
        subtitle="Customers and vendors in one place."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New Partner
          </Button>
        }
      />

      {isLoading ? (
        <PageLoader />
      ) : !partners?.length ? (
        <EmptyState icon={<Users className="h-10 w-10" />} title="No partners yet" hint="Add a customer or vendor." />
      ) : (
        <>
          <ListToolbar
            controls={controls}
            count={filtered.length}
            searchPlaceholder="Search by name, email or phone…"
            filters={[{ key: "type", label: "Types", icon: Tag, options: TYPE_OPTIONS }]}
          />

          {!filtered.length ? (
            <NoResults onReset={controls.reset} />
          ) : controls.view === "grid" ? (
            <div className={`grid gap-3 ${GRID_COLS[controls.gridSize]}`}>
              {filtered.map((p) => (
                <PartnerCard key={p.id} p={p} />
              ))}
            </div>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-5 py-3">Name</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3">Email</th>
                      <th className="px-5 py-3">Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const meta = TYPE_META[p.type];
                      return (
                        <tr key={p.id} className="border-b border-teal-100 hover:bg-teal-50/70">
                          <td className="px-5 py-3">
                            <span className="flex items-center gap-2 font-medium text-slate-800">
                              <Avatar name={p.name} size="xs" /> {p.name}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <Badge className={meta.color}>
                              <meta.icon className="mr-1 h-3 w-3" /> {meta.label}
                            </Badge>
                          </td>
                          <td className="px-5 py-3 text-slate-500">{p.email || "—"}</td>
                          <td className="px-5 py-3 text-slate-500">{p.phone || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {creating && <PartnerForm onClose={() => setCreating(false)} />}
    </div>
  );
}

function PartnerCard({ p }: { p: Partner }) {
  const meta = TYPE_META[p.type];
  return (
    <div className="flex flex-col rounded-lg border border-teal-100 bg-white/85 p-4 shadow-sm shadow-teal-950/[0.04] backdrop-blur transition hover:border-teal-300 hover:shadow-md">
      <div className="flex items-center gap-3">
        <Avatar name={p.name} size="md" />
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-800">{p.name}</p>
          <Badge className={`mt-0.5 ${meta.color}`}>
            <meta.icon className="mr-1 h-3 w-3" /> {meta.label}
          </Badge>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 border-t border-teal-50 pt-3 text-sm text-slate-500">
        <p className="flex items-center gap-2 truncate">
          <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" /> {p.email || "—"}
        </p>
        <p className="flex items-center gap-2 truncate">
          <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" /> {p.phone || "—"}
        </p>
      </div>
    </div>
  );
}

function PartnerForm({ onClose }: { onClose: () => void }) {
  const create = useCreatePartner();
  const [form, setForm] = useState({ name: "", type: "customer", email: "", phone: "", address: "" });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  function save() {
    if (!form.name.trim()) return toast.error("Name is required");
    create.mutate(form, {
      onSuccess: () => {
        toast.success("Partner created");
        onClose();
      },
      onError: (e) => toast.error(apiError(e)),
    });
  }

  return (
    <Modal open onClose={onClose} title="New Partner">
      <div className="space-y-4">
        <div>
          <Label>Name</Label>
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div>
          <Label>Type</Label>
          <Select value={form.type} onChange={(e) => set({ type: e.target.value })}>
            <option value="customer">Customer</option>
            <option value="vendor">Vendor</option>
            <option value="both">Both</option>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => set({ email: e.target.value })} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>Address</Label>
          <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={create.isPending}>
            Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}
