import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Boxes, ArrowRight, ArrowLeft, ShieldCheck, Factory, BarChart3, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { apiError } from "@/lib/api";
import { Button, Input, Label } from "@/components/ui";

const DEMO_ACCOUNTS: { label: string; username: string }[] = [
  { label: "System Admin", username: "shivadmin" },
  { label: "Owner", username: "shivowner" },
  { label: "Sales", username: "shivsales" },
  { label: "Purchase", username: "shivbuyer" },
  { label: "Manufacturing", username: "shivmfg1" },
  { label: "Inventory", username: "shivstock" },
];
const DEMO_PW = "demo1234";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("shivadmin");
  const [password, setPassword] = useState(DEMO_PW);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e?: React.FormEvent, creds?: { identifier: string; password: string }) {
    e?.preventDefault();
    const id = (creds?.identifier ?? identifier).trim();
    const pw = creds?.password ?? password;
    if (!id || !pw) {
      setError("Enter your username (or email) and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(id, pw, remember);
      navigate("/");
    } catch (err) {
      setError(apiError(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-teal-50 p-4">
      {/* drifting background orbs — matches the landing page */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="animate-drift absolute -left-24 top-10 h-72 w-72 rounded-full bg-teal-300/30 blur-3xl" />
        <div className="animate-drift-rev absolute -right-16 top-40 h-80 w-80 rounded-full bg-emerald-300/25 blur-3xl" />
        <div className="animate-float-slow absolute -bottom-10 left-1/3 h-64 w-64 rounded-full bg-teal-200/40 blur-3xl" />
      </div>

      <div className="animate-rise relative z-10 grid w-full max-w-5xl overflow-hidden rounded-2xl border border-teal-100 bg-white/90 shadow-2xl shadow-teal-950/10 backdrop-blur md:grid-cols-[1.05fr_0.95fr]">
        {/* Brand panel — teal-950 to match the app sidebar */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-teal-950 p-8 text-teal-50 md:flex">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="animate-float absolute -right-10 top-8 h-40 w-40 rounded-full bg-teal-500/20 blur-2xl" />
            <div className="animate-float-slow absolute bottom-6 left-6 h-44 w-44 rounded-full bg-emerald-500/15 blur-2xl" />
          </div>
          <div className="relative flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-600 ring-1 ring-teal-500/30">
              <Boxes className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-white">Mini ERP</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-teal-200/70">Operations Platform</p>
            </div>
          </div>
          <div className="relative">
            <h2 className="max-w-md text-3xl font-semibold leading-tight text-white">
              Demand-to-delivery operations for{" "}
              <span className="bg-gradient-to-r from-teal-300 to-emerald-300 bg-clip-text text-transparent">
                every company you run
              </span>
              .
            </h2>
            <div className="mt-8 grid gap-3">
              <LoginPoint icon={<BarChart3 className="h-4 w-4" />} title="Control tower" text="Sales, production, procurement, and delivery risk." />
              <LoginPoint icon={<Factory className="h-4 w-4" />} title="Manufacturing ready" text="MTO and MTS flows with material visibility." />
              <LoginPoint icon={<ShieldCheck className="h-4 w-4" />} title="Per-module access" text="System Admins assign access company by company." />
            </div>
          </div>
          <p className="relative text-xs text-teal-200/60">Isolated tenants · Real-time operational ledger</p>
        </div>

        {/* Form panel */}
        <div className="p-8 sm:p-10">
          <Link to="/welcome" className="mb-6 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-teal-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to home
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-600">Sign in with your username or email — or try a demo account.</p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <div>
              <Label>Username or Email</Label>
              <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" />
            </div>
            <div>
              <Label>Password</Label>
              <div className="relative">
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-teal-50 hover:text-teal-700"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-teal-200 text-teal-700 focus:ring-teal-400"
              />
              Remember me on this device
            </label>
            {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">
              Sign in <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-600">
            New here?{" "}
            <Link to="/signup" className="font-semibold text-teal-700 hover:text-teal-900 hover:underline">
              Create a company
            </Link>
          </p>

          <div className="mt-6">
            <div className="mb-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              <span className="h-px flex-1 bg-teal-100" />
              Quick login
              <span className="h-px flex-1 bg-teal-100" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.username}
                  type="button"
                  onClick={() => {
                    setIdentifier(a.username);
                    setPassword(DEMO_PW);
                    submit(undefined, { identifier: a.username, password: DEMO_PW });
                  }}
                  className="rounded-md border border-teal-100 bg-teal-50/40 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:border-teal-300 hover:bg-teal-100/70 hover:text-teal-800"
                >
                  {a.label}
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
    <div className="flex gap-3 rounded-md border border-white/10 bg-white/[0.04] p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-teal-100">{icon}</div>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-teal-100/70">{text}</p>
      </div>
    </div>
  );
}
