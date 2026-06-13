import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boxes, ArrowRight, ShieldCheck, Factory, BarChart3 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { apiError } from "@/lib/api";
import { Button, Input, Label } from "@/components/ui";
import type { Role } from "@/lib/types";
import { ROLE_META } from "@/lib/nav";

const DEMO_ACCOUNTS: { role: Role; email: string }[] = [
  { role: "admin", email: "admin@shivfurniture.com" },
  { role: "sales", email: "sales@shivfurniture.com" },
  { role: "purchase", email: "purchase@shivfurniture.com" },
  { role: "manufacturing", email: "mfg@shivfurniture.com" },
  { role: "inventory", email: "inventory@shivfurniture.com" },
  { role: "owner", email: "owner@shivfurniture.com" },
];
const DEMO_PW = "demo1234";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@shivfurniture.com");
  const [password, setPassword] = useState(DEMO_PW);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e?: React.FormEvent, creds?: { email: string; password: string }) {
    e?.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(creds?.email ?? email, creds?.password ?? password);
      navigate("/");
    } catch (err) {
      setError(apiError(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-lg border border-teal-100 bg-white/90 shadow-2xl shadow-teal-950/20 backdrop-blur md:grid-cols-[1.15fr_0.85fr]">
        <div className="hidden flex-col justify-between bg-slate-900 p-8 text-white md:flex">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-700">
              <Boxes className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold">Shiv Furniture</p>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Enterprise ERP</p>
            </div>
          </div>
          <div>
            <h2 className="max-w-md text-3xl font-semibold leading-tight">
              Demand-to-delivery operations for furniture manufacturing.
            </h2>
            <div className="mt-8 grid gap-3">
              <LoginPoint icon={<BarChart3 className="h-4 w-4" />} title="Control tower" text="Sales, production, procurement, and delivery risk." />
              <LoginPoint icon={<Factory className="h-4 w-4" />} title="Manufacturing ready" text="MTO and MTS flows with material visibility." />
              <LoginPoint icon={<ShieldCheck className="h-4 w-4" />} title="Audit grade" text="Ledger-driven stock movement and role access." />
            </div>
          </div>
          <p className="text-xs text-slate-400">Secure tenant access · Real-time operational ledger</p>
        </div>

        <div className="p-8">
          <h1 className="text-xl font-semibold text-slate-950">Sign in</h1>
          <p className="mt-1 text-sm text-slate-600">Use a demo account below or enter credentials.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
              />
            </div>
            {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">
              Sign in <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Quick login as</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.role}
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(DEMO_PW);
                    submit(undefined, { email: a.email, password: DEMO_PW });
                  }}
                  className="rounded-md border border-teal-100 bg-teal-50/40 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:border-teal-300 hover:bg-teal-100/70 hover:text-teal-800"
                >
                  <span className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${ROLE_META[a.role].color}`} />
                  {ROLE_META[a.role].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginPoint({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-teal-100">{icon}</div>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-300">{text}</p>
      </div>
    </div>
  );
}
