import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Boxes, ArrowRight, ArrowLeft, Check, X, Wand2, Upload, Building2, MailCheck } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { apiError } from "@/lib/api";
import { Button, Input, Label } from "@/components/ui";
import { cn } from "@/lib/utils";
import { isStrongPassword, usernameError, passwordRuleStatus, suggestStrongPassword } from "@/lib/password";

const PHOTO_MAX_BYTES = 900 * 1024;

export default function Signup() {
  const { signupRequest, signupVerify, signupResend } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"details" | "verify">("details");
  const [company, setCompany] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const [code, setCode] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const ruleStatus = passwordRuleStatus(password);
  const pwOk = isStrongPassword(password);
  const usernameMsg = username ? usernameError(username) : null;
  const confirmMismatch = confirm.length > 0 && confirm !== password;

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Photo must be an image file.");
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setError("Photo is too large (max ~900KB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  function validateDetails(): string | null {
    if (!company.trim()) return "Company name is required.";
    const lid = usernameError(username);
    if (lid) return lid;
    if (!email.trim()) return "Email is required.";
    if (!isStrongPassword(password)) return "Password does not meet the requirements.";
    if (password !== confirm) return "Passwords do not match.";
    return null;
  }

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    const v = validateDetails();
    if (v) {
      setError(v);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await signupRequest({
        company_name: company.trim(),
        username: username.trim(),
        email: email.trim(),
        full_name: fullName.trim(),
        password,
        photo,
      });
      setDevOtp(res.dev_otp ?? null);
      setStep("verify");
    } catch (err) {
      setError(apiError(err, "Could not start signup."));
    } finally {
      setLoading(false);
    }
  }

  async function submitVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length < 4) {
      setError("Enter the verification code from your email.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await signupVerify(email.trim(), code.trim());
      navigate("/");
    } catch (err) {
      setError(apiError(err, "Verification failed."));
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError("");
    try {
      const res = await signupResend(email.trim());
      setDevOtp(res.dev_otp ?? null);
    } catch (err) {
      setError(apiError(err, "Could not resend the code."));
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

      <div className="animate-rise relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-teal-100 bg-white/95 shadow-2xl shadow-teal-950/10 backdrop-blur">
        <div className="relative flex items-center gap-2.5 overflow-hidden bg-teal-950 px-6 py-5 text-white">
          <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-teal-500/20 blur-2xl" />
          <div className="relative flex h-10 w-10 items-center justify-center rounded-md bg-teal-600 ring-1 ring-teal-500/30">
            <Boxes className="h-6 w-6" />
          </div>
          <div className="relative">
            <p className="font-semibold">Create your company</p>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-teal-200/70">
              {step === "details" ? "Step 1 of 2 · Details" : "Step 2 of 2 · Verify email"}
            </p>
          </div>
        </div>

        <div className="p-6">
          <Link to="/welcome" className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-teal-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to home
          </Link>
          {error && <p className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          {step === "details" ? (
            <form onSubmit={submitDetails} className="space-y-4" noValidate>
              <div>
                <Label>Company Name</Label>
                <div className="relative">
                  <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Manufacturing" className="pl-9" />
                </div>
                <p className="mt-1 text-xs text-slate-500">You'll be its first System Administrator.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Username</Label>
                  <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="6–12 chars" autoComplete="username" />
                  {usernameMsg && <p className="mt-1 text-xs text-rose-600">{usernameMsg}</p>}
                </div>
                <div>
                  <Label>Full Name</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Optional" />
                </div>
              </div>

              <div>
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@company.com" />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label>Password</Label>
                  <button
                    type="button"
                    onClick={() => {
                      const p = suggestStrongPassword();
                      setPassword(p);
                      setConfirm(p);
                      setShowPw(true);
                    }}
                    className="mb-1.5 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900"
                  >
                    <Wand2 className="h-3.5 w-3.5" /> Suggest strong password
                  </button>
                </div>
                <div className="relative">
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-700"
                  >
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
                <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  {ruleStatus.map(({ rule, ok }) => (
                    <li key={rule.key} className={cn("flex items-center gap-1.5 text-xs", ok ? "text-emerald-600" : "text-slate-500")}>
                      {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5 text-slate-300" />}
                      {rule.label}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <Label>Re-enter Password</Label>
                <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} type={showPw ? "text" : "password"} autoComplete="new-password" />
                {confirmMismatch && <p className="mt-1 text-xs text-rose-600">Passwords do not match.</p>}
              </div>

              <div>
                <Label>Photo (optional)</Label>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-teal-100 bg-teal-50">
                    {photo ? <img src={photo} alt="avatar" className="h-full w-full object-cover" /> : <Upload className="h-4 w-4 text-slate-400" />}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
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

              <Button type="submit" loading={loading} disabled={!pwOk || !!usernameMsg || confirmMismatch} className="w-full">
                Send verification code <ArrowRight className="h-4 w-4" />
              </Button>

              <p className="text-center text-sm text-slate-600">
                Already have an account?{" "}
                <Link to="/login" className="font-semibold text-teal-700 hover:text-teal-900 hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          ) : (
            <form onSubmit={submitVerify} className="space-y-4" noValidate>
              <div className="flex items-start gap-3 rounded-md border border-teal-100 bg-teal-50/60 p-3">
                <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
                <p className="text-sm text-slate-700">
                  We sent a verification code to <span className="font-semibold">{email}</span>. Enter it below to finish creating{" "}
                  <span className="font-semibold">{company}</span>.
                </p>
              </div>

              {devOtp && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Dev mode (no SMTP configured): your code is <span className="font-mono font-bold">{devOtp}</span>
                </p>
              )}

              <div>
                <Label>Verification Code</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit code"
                  className="text-center text-lg tracking-[0.4em]"
                />
              </div>

              <Button type="submit" loading={loading} className="w-full">
                Verify & create company <ArrowRight className="h-4 w-4" />
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button type="button" onClick={() => { setStep("details"); setError(""); }} className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
                <button type="button" onClick={resend} className="font-semibold text-teal-700 hover:text-teal-900 hover:underline">
                  Resend code
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
