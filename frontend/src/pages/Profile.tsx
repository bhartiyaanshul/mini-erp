import { useRef, useState } from "react";
import { Upload, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import { useUpdateUser } from "@/lib/queries";
import { apiError } from "@/lib/api";
import { MODULE_LABEL, ACCESS_LABEL } from "@/lib/access";
import { MODULES } from "@/lib/types";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, PageHeader } from "@/components/ui";

const PHOTO_MAX_BYTES = 900 * 1024;

export default function Profile() {
  const { user, setUser } = useAuth();
  const update = useUpdateUser();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(user!.full_name);
  const [address, setAddress] = useState("");
  const [mobile, setMobile] = useState("");
  const [photo, setPhoto] = useState<string | null>(user!.photo || null);

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Photo must be an image.");
    if (file.size > PHOTO_MAX_BYTES) return toast.error("Photo is too large (max ~900KB).");
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  function save() {
    update.mutate(
      { id: user!.id, body: { full_name: fullName, address, mobile_number: mobile, photo } },
      {
        onSuccess: (u) => {
          setUser({ ...user!, full_name: u.full_name, photo: u.photo });
          toast.success("Profile updated");
        },
        onError: (e) => toast.error(apiError(e, "Could not save profile")),
      }
    );
  }

  return (
    <div>
      <PageHeader title="My Profile" subtitle={`${user!.company_name} · ${user!.is_system_admin ? "System Administrator" : "System User"}`} />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Account details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-teal-100 bg-teal-50">
                {photo ? <img src={photo} alt="avatar" className="h-full w-full object-cover" /> : <Upload className="h-5 w-5 text-slate-400" />}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  {photo ? "Change photo" : "Upload photo"}
                </Button>
                {photo && (
                  <button type="button" onClick={() => setPhoto(null)} className="text-xs font-semibold text-rose-600 hover:text-rose-800">
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Username</Label>
                <Input value={user!.username} disabled />
              </div>
              <div>
                <Label>Email (cannot change)</Label>
                <Input value={user!.email} disabled />
              </div>
            </div>

            <div>
              <Label>Full Name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Mobile Number</Label>
                <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+91…" />
              </div>
              <div>
                <Label>Position (set by admin)</Label>
                <Input value={user!.is_system_admin ? "System Administrator" : ""} placeholder="—" disabled />
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="City, State" />
            </div>

            <Button onClick={save} loading={update.isPending}>
              <Save className="h-4 w-4" /> Save changes
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {user!.is_system_admin ? (
              <div className="flex items-center gap-2 rounded-md border border-teal-100 bg-teal-50/60 p-3 text-sm text-slate-700">
                <ShieldCheck className="h-4 w-4 text-teal-700" />
                System Administrator — full access to every module and user management.
              </div>
            ) : (
              MODULES.map((m) => (
                <div key={m} className="flex items-center justify-between rounded-md border border-teal-100 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-700">{MODULE_LABEL[m]}</span>
                  <Badge className={user!.access[m] === "admin" ? "bg-teal-100 text-teal-800" : user!.access[m] === "user" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}>
                    {ACCESS_LABEL[user!.access[m]]}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
