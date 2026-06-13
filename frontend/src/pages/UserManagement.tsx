import { useRef, useState } from "react";
import { Plus, Pencil, UserX, Wand2, Upload, ShieldCheck, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import { useUsers, useCreateUser, useUpdateUser, useUpdateUserAccess, useDeleteUser } from "@/lib/queries";
import { apiError } from "@/lib/api";
import { ACCESS_LABEL, MODULE_LABEL } from "@/lib/access";
import { isStrongPassword, usernameError, passwordRuleStatus, suggestStrongPassword } from "@/lib/password";
import { MODULES, type AccessLevel, type AdminUser, type Module } from "@/lib/types";
import { cn } from "@/lib/utils";
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

const PHOTO_MAX_BYTES = 900 * 1024;
const emptyAccess = (): Record<Module, AccessLevel> =>
  ({ sales: "none", purchase: "none", manufacturing: "none", product: "none" });

export default function UserManagement() {
  const { user: me } = useAuth();
  const { data: users, isLoading } = useUsers();
  const [editing, setEditing] = useState<AdminUser | "new" | null>(null);
  const deactivate = useDeleteUser();

  function onDeactivate(u: AdminUser) {
    if (!confirm(`Deactivate ${u.full_name}? They will no longer be able to sign in.`)) return;
    deactivate.mutate(u.id, {
      onSuccess: () => toast.success(`${u.full_name} deactivated`),
      onError: (e) => toast.error(apiError(e, "Could not deactivate user")),
    });
  }

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle={`${me!.company_name} · assign per-module access to your team`}
        action={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Add user
          </Button>
        }
      />

      {isLoading ? (
        <PageLoader />
      ) : !users || users.length === 0 ? (
        <EmptyState title="No users yet" hint="Add team members and grant them per-module access." icon={<UsersIcon className="h-8 w-8" />} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-teal-100 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3 font-semibold">User</th>
                  <th className="px-5 py-3 font-semibold">Username</th>
                  <th className="px-5 py-3 font-semibold">Access</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-teal-50">
                {users.map((u) => (
                  <tr key={u.id} className={cn("hover:bg-teal-50/50", !u.is_active && "opacity-50")}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-teal-100 bg-teal-50 text-xs font-semibold text-teal-700">
                          {u.photo ? <img src={u.photo} alt="" className="h-full w-full object-cover" /> : u.full_name.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{u.full_name}</p>
                          <p className="text-xs text-slate-500">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{u.username}</td>
                    <td className="px-5 py-3">
                      {u.is_system_admin ? (
                        <Badge className="bg-teal-100 text-teal-800">
                          <ShieldCheck className="mr-1 h-3 w-3" /> System Admin
                        </Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {MODULES.filter((m) => u.access[m] !== "none").map((m) => (
                            <Badge key={m} className={u.access[m] === "admin" ? "bg-teal-100 text-teal-800" : "bg-blue-100 text-blue-700"}>
                              {MODULE_LABEL[m]}: {ACCESS_LABEL[u.access[m]]}
                            </Badge>
                          ))}
                          {MODULES.every((m) => u.access[m] === "none") && <span className="text-xs text-slate-400">No access</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Badge className={u.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}>
                        {u.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(u)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {u.id !== me!.id && u.is_active && (
                          <Button variant="ghost" size="icon" onClick={() => onDeactivate(u)} title="Deactivate">
                            <UserX className="h-4 w-4 text-rose-600" />
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

      {editing && <UserModal initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function UserModal({ initial, onClose }: { initial: AdminUser | "new"; onClose: () => void }) {
  const isNew = initial === "new";
  const u = isNew ? null : (initial as AdminUser);
  const create = useCreateUser();
  const updateUser = useUpdateUser();
  const updateAccess = useUpdateUserAccess();
  const fileRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(u?.username ?? "");
  const [email, setEmail] = useState(u?.email ?? "");
  const [fullName, setFullName] = useState(u?.full_name ?? "");
  const [password, setPassword] = useState("");
  const [position, setPosition] = useState(u?.position ?? "");
  const [mobile, setMobile] = useState(u?.mobile_number ?? "");
  const [address, setAddress] = useState(u?.address ?? "");
  const [photo, setPhoto] = useState<string | null>(u?.photo || null);
  const [isAdmin, setIsAdmin] = useState(u?.is_system_admin ?? false);
  const [access, setAccess] = useState<Record<Module, AccessLevel>>(u ? { ...emptyAccess(), ...u.access } : emptyAccess());
  const [error, setError] = useState("");

  const usernameMsg = username ? usernameError(username) : null;
  const pwOk = isNew ? isStrongPassword(password) : true;
  const busy = create.isPending || updateUser.isPending || updateAccess.isPending;

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Photo must be an image.");
    if (file.size > PHOTO_MAX_BYTES) return setError("Photo is too large (max ~900KB).");
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  function submit() {
    setError("");
    if (isNew) {
      if (usernameError(username)) return setError(usernameError(username)!);
      if (!email.trim()) return setError("Email is required.");
      if (!isStrongPassword(password)) return setError("Password does not meet the requirements.");
      create.mutate(
        {
          username: username.trim(),
          email: email.trim(),
          full_name: fullName.trim(),
          password,
          is_system_admin: isAdmin,
          position,
          mobile_number: mobile,
          address,
          photo,
          access,
        },
        {
          onSuccess: () => {
            toast.success("User created");
            onClose();
          },
          onError: (e) => setError(apiError(e, "Could not create user")),
        }
      );
    } else {
      // Update profile/role, then access, then close.
      updateUser.mutate(
        {
          id: u!.id,
          body: { full_name: fullName, position, mobile_number: mobile, address, photo, is_system_admin: isAdmin },
        },
        {
          onSuccess: () => {
            updateAccess.mutate(
              { id: u!.id, access },
              {
                onSuccess: () => {
                  toast.success("User updated");
                  onClose();
                },
                onError: (e) => setError(apiError(e, "Saved profile, but access update failed")),
              }
            );
          },
          onError: (e) => setError(apiError(e, "Could not update user")),
        }
      );
    }
  }

  const ruleStatus = passwordRuleStatus(password);

  return (
    <Modal open onClose={onClose} title={isNew ? "Add user" : `Edit ${u!.full_name}`} wide>
      <div className="space-y-4">
        {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} disabled={!isNew} placeholder="6–12 chars" />
            {usernameMsg && isNew && <p className="mt-1 text-xs text-rose-600">{usernameMsg}</p>}
          </div>
          <div>
            <Label>Email {!isNew && "(cannot change)"}</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" disabled={!isNew} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label>Position</Label>
            <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Sales Manager" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Mobile Number</Label>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+91…" />
          </div>
          <div>
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>

        {isNew && (
          <div>
            <div className="flex items-center justify-between">
              <Label>Password</Label>
              <button
                type="button"
                onClick={() => setPassword(suggestStrongPassword())}
                className="mb-1.5 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900"
              >
                <Wand2 className="h-3.5 w-3.5" /> Suggest
              </button>
            </div>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} type="text" autoComplete="new-password" />
            <ul className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1">
              {ruleStatus.map(({ rule, ok }) => (
                <li key={rule.key} className={cn("text-xs", ok ? "text-emerald-600" : "text-slate-400")}>
                  • {rule.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-teal-100 bg-teal-50">
            {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : <Upload className="h-4 w-4 text-slate-400" />}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            {photo ? "Change photo" : "Upload photo"}
          </Button>
        </div>

        <label className="flex items-center gap-2 rounded-md border border-teal-100 bg-teal-50/40 px-3 py-2.5 text-sm">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} className="h-4 w-4 accent-teal-700" />
          <ShieldCheck className="h-4 w-4 text-teal-700" />
          <span className="font-medium text-slate-700">System Administrator (full access + can manage users)</span>
        </label>

        <div className={cn("transition-opacity", isAdmin && "pointer-events-none opacity-40")}>
          <Label>Per-module access</Label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {MODULES.map((m) => (
              <div key={m}>
                <p className="mb-1 text-xs font-semibold text-slate-600">{MODULE_LABEL[m]}</p>
                <Select value={access[m]} onChange={(e) => setAccess((a) => ({ ...a, [m]: e.target.value as AccessLevel }))}>
                  <option value="none">None</option>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </Select>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            User = view/create/edit · Admin = also confirm, delete & edit BoM.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-teal-100 pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={isNew && (!pwOk || !!usernameMsg)}>
            {isNew ? "Create user" : "Save changes"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
