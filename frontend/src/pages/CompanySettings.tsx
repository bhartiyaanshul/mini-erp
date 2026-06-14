import { useRef, useState } from "react";
import { Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import { useCompany, useUpdateCompany } from "@/lib/queries";
import { apiError } from "@/lib/api";
import type { CompanyBranding } from "@/lib/types";
import { money } from "@/lib/utils";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageHeader,
  PageLoader,
  Textarea,
} from "@/components/ui";

const LOGO_MAX_BYTES = 900 * 1024;

export default function CompanySettings() {
  const { data, isLoading } = useCompany();
  if (isLoading || !data) return <PageLoader />;
  // Key by id so the form initializes its local state once the data has loaded.
  return <BrandingEditor key={data.id} company={data} />;
}

function BrandingEditor({ company }: { company: CompanyBranding }) {
  const { user, setUser } = useAuth();
  const update = useUpdateCompany();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(company.name);
  const [address, setAddress] = useState(company.address);
  const [email, setEmail] = useState(company.email);
  const [phone, setPhone] = useState(company.phone);
  const [website, setWebsite] = useState(company.website);
  const [logo, setLogo] = useState(company.logo);
  const [brandColor, setBrandColor] = useState(company.brand_color || "#0f766e");
  const [gstin, setGstin] = useState(company.gstin);
  const [gstRate, setGstRate] = useState(String(company.gst_rate ?? 0));
  const [footer, setFooter] = useState(company.invoice_footer);

  function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Logo must be an image.");
    if (file.size > LOGO_MAX_BYTES) return toast.error("Logo is too large (max ~900KB).");
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result as string);
    reader.readAsDataURL(file);
  }

  function save() {
    if (!name.trim()) return toast.error("Company name is required.");
    const rate = Number(gstRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return toast.error("GST rate must be between 0 and 100.");
    update.mutate(
      {
        name: name.trim(),
        address,
        email,
        phone,
        website,
        logo,
        brand_color: brandColor,
        gstin,
        gst_rate: rate,
        invoice_footer: footer,
      },
      {
        onSuccess: (saved) => {
          if (user) setUser({ ...user, company_name: saved.name });
          toast.success("Company branding saved");
        },
        onError: (e) => toast.error(apiError(e, "Could not save branding")),
      }
    );
  }

  return (
    <div>
      <PageHeader
        title="Company Branding"
        subtitle="Your logo, contact details and tax identity appear on every invoice, order and delivery note you generate."
      />
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Logo */}
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-teal-100 bg-teal-50">
                {logo ? (
                  <img src={logo} alt="logo" className="h-full w-full object-contain" />
                ) : (
                  <Upload className="h-5 w-5 text-slate-400" />
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleLogo} className="hidden" />
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  {logo ? "Change logo" : "Upload logo"}
                </Button>
                {logo && (
                  <button
                    type="button"
                    onClick={() => setLogo("")}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-800"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div>
              <Label>Company name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Address</Label>
              <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, City, State, PIN" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hello@company.com" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Website</Label>
                <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="company.com" />
              </div>
              <div>
                <Label>GSTIN</Label>
                <Input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="27ABCDE1234F1Z5" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Default GST rate (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={gstRate}
                  onChange={(e) => setGstRate(e.target.value)}
                />
              </div>
              <div>
                <Label>Accent colour</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-teal-100 bg-white"
                    aria-label="Accent colour"
                  />
                  <Input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} />
                </div>
              </div>
            </div>
            <div>
              <Label>Invoice footer / terms (optional)</Label>
              <Textarea
                rows={2}
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
                placeholder="e.g. Goods once sold will not be taken back. Subject to local jurisdiction."
              />
            </div>

            <Button onClick={save} loading={update.isPending}>
              <Save className="h-4 w-4" /> Save branding
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Live preview</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentPreview
              name={name}
              address={address}
              contact={[phone, email, website].filter(Boolean).join("  ·  ")}
              logo={logo}
              accent={brandColor}
              gstin={gstin}
              gstRate={Number(gstRate) || 0}
            />
            <p className="mt-3 text-xs text-slate-500">
              This mirrors the masthead and accent printed on the PDF documents.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DocumentPreview({
  name,
  address,
  contact,
  logo,
  accent,
  gstin,
  gstRate,
}: {
  name: string;
  address: string;
  contact: string;
  logo: string;
  accent: string;
  gstin: string;
  gstRate: number;
}) {
  const subtotal = 125000;
  const tax = gstRate > 0 ? Math.round((subtotal * gstRate) / 100) : 0;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="h-2" style={{ background: accent }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {logo && <img src={logo} alt="" className="mb-1.5 h-9 w-auto object-contain" />}
            <p className="truncate text-base font-bold text-slate-900">{name || "Your Company"}</p>
            {address && <p className="whitespace-pre-line text-[11px] leading-snug text-slate-500">{address}</p>}
            {contact && <p className="text-[11px] text-slate-500">{contact}</p>}
            {gstin && <p className="text-[11px] text-slate-500">GSTIN: {gstin}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-base font-bold tracking-wide" style={{ color: accent }}>
              {gstin ? "TAX INVOICE" : "INVOICE"}
            </p>
            <p className="text-[11px] text-slate-500">INV-0007</p>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-md border border-slate-100">
          <div className="grid grid-cols-[1fr_auto] gap-4 px-3 py-1.5 text-[11px] font-semibold text-white" style={{ background: accent }}>
            <span>Product</span>
            <span>Amount</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-4 px-3 py-1.5 text-[11px] text-slate-600">
            <span>Teak Dining Table × 2</span>
            <span className="tabular-nums">{money(90000)}</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-4 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600">
            <span>Oak Chair × 5</span>
            <span className="tabular-nums">{money(35000)}</span>
          </div>
        </div>

        <div className="mt-2 flex flex-col items-end gap-0.5 text-[11px]">
          <div className="flex w-40 justify-between text-slate-500">
            <span>Subtotal</span>
            <span className="tabular-nums">{money(subtotal)}</span>
          </div>
          {tax > 0 && (
            <div className="flex w-40 justify-between text-slate-500">
              <span>GST @ {gstRate}%</span>
              <span className="tabular-nums">{money(tax)}</span>
            </div>
          )}
          <div className="mt-0.5 flex w-40 justify-between border-t pt-0.5 font-semibold text-slate-800" style={{ borderColor: accent }}>
            <span>Total</span>
            <span className="tabular-nums">{money(subtotal + tax)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
