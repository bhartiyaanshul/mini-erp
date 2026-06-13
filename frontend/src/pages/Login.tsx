import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boxes, ArrowRight } from "lucide-react";
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-900 to-brand-900 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl md:grid-cols-2">
        {/* Left: pitch */}
        <div className="hidden flex-col justify-between bg-gradient-to-br from-brand-600 to-brand-900 p-8 text-white md:flex">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
              <Boxes className="h-6 w-6" />
            </div>
            <div>
              <p className="font-bold">Shiv Furniture</p>
              <p className="text-xs text-white/70">Mini ERP — Demand to Delivery</p>
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold leading-snug">
              One connected system, from sales to the shop floor.
            </h2>
            <p className="mt-3 text-sm text-white/80">
              Every quantity is derived from an immutable stock ledger — real-time, fully auditable,
              with automated procurement built in.
            </p>
          </div>
          <p className="text-xs text-white/60">Solo build · FastAPI · React · SQLite→Postgres-ready</p>
        </div>

        {/* Right: form */}
        <div className="p-8">
          <h1 className="text-xl font-bold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Use a demo account below or enter credentials.</p>

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
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">
              Sign in <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <div className="mt-6">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Quick login as</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.role}
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(DEMO_PW);
                    submit(undefined, { email: a.email, password: DEMO_PW });
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-600 transition hover:border-brand-400 hover:bg-brand-50"
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
