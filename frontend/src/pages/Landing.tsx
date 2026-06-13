import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Boxes,
  ArrowRight,
  ShoppingCart,
  Truck,
  Factory,
  Warehouse,
  Users,
  ScrollText,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  LineChart,
  Layers,
  PlugZap,
  Building2,
  Store,
  Hammer,
  Boxes as BoxesIcon,
  CheckCircle2,
  BookOpen,
  Github,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui";

// Product-agnostic landing page for the Mini ERP platform.

const MODULES = [
  { icon: LayoutDashboard, title: "Control Tower", text: "A live dashboard of sales, production, procurement and delivery risk — one screen for the whole operation." },
  { icon: ShoppingCart, title: "Sales Orders", text: "Quote to confirmed order to delivery. Track fulfilment status and reserve stock automatically." },
  { icon: Truck, title: "Purchasing", text: "Raise purchase orders, receive goods, and reconcile vendor bills against what actually arrived." },
  { icon: Factory, title: "Manufacturing", text: "Make-to-order and make-to-stock work orders driven by Bills of Materials and component availability." },
  { icon: Warehouse, title: "Inventory", text: "A ledger-driven stock engine — every movement is recorded, so on-hand quantities always reconcile." },
  { icon: Users, title: "Partners", text: "One directory for customers and vendors, with contacts, terms and full transaction history." },
  { icon: ScrollText, title: "Audit Trail", text: "An immutable record of who changed what and when — owner-level visibility into every action." },
  { icon: Sparkles, title: "AI Copilot", text: "Ask plain-language questions about your data and get instant answers, summaries and demand forecasts." },
];

const STEPS = [
  { n: "01", title: "Sign in by role", text: "Pick a role — Owner, Sales, Purchase, Manufacturing or Inventory. Each person sees only the modules and actions they need." },
  { n: "02", title: "Set up your catalogue", text: "Add products and Bills of Materials. Register customers and vendors as partners. Load opening stock once and the ledger takes over." },
  { n: "03", title: "Run the daily flow", text: "Confirm sales orders, raise purchase orders, schedule work orders, and receive goods. Stock and statuses update in real time." },
  { n: "04", title: "Watch the Control Tower", text: "The dashboard surfaces shortages, late orders and production load. Use the AI copilot to ask anything and forecast demand." },
];

const USE_CASES = [
  { icon: Hammer, title: "Made-to-order manufacturers", text: "Furniture, fabrication, custom assembly — quote, build against a BoM, and deliver while tracking component availability." },
  { icon: Store, title: "Wholesale & distribution", text: "Buy, stock and resell. Keep purchasing and sales in sync with a single source of truth for inventory." },
  { icon: BoxesIcon, title: "Make-to-stock producers", text: "Run production to replenish stock levels and let the dashboard flag when it's time to build more." },
  { icon: Building2, title: "Small & growing businesses", text: "Replace a tangle of spreadsheets with one role-based system — without the cost and complexity of enterprise ERP." },
];

const DOC_HOW = [
  "Use the demo accounts on the sign-in screen — one click logs you in as any role with sample data preloaded.",
  "Start on the Dashboard (Control Tower) to read the state of the business at a glance.",
  "Create a Sales Order from the Sales module; confirm it to reserve stock and trigger fulfilment.",
  "Need to build it? Open Manufacturing, pick the product's Bill of Materials, and schedule a work order.",
  "Short on components? Raise a Purchase Order, then record goods receipt when the vendor delivers.",
  "Every transaction posts to the inventory ledger automatically — check Inventory to see live on-hand quantities.",
  "Owners can open the Audit module to review the full change history, and use the AI copilot for questions and forecasts.",
];

const DOC_WHEN = [
  { good: true, text: "You run a sales → purchase → production → delivery cycle and want it in one place." },
  { good: true, text: "You need role-based access so each team only sees and edits what's relevant to them." },
  { good: true, text: "You want inventory that always reconciles because it's driven by an immutable ledger." },
  { good: true, text: "You're outgrowing spreadsheets but don't want heavyweight enterprise ERP." },
  { good: false, text: "You only need accounting or invoicing with no operations or stock to manage." },
  { good: false, text: "You require deep, industry-specific compliance modules out of the box." },
];

const ROLES = [
  { label: "Owner", text: "Full visibility — dashboard, audit trail and every module." },
  { label: "Sales", text: "Quotes, sales orders, customers and fulfilment status." },
  { label: "Purchase", text: "Purchase orders, vendors, goods receipt and bills." },
  { label: "Manufacturing", text: "Work orders, Bills of Materials and production load." },
  { label: "Inventory", text: "Stock movements, on-hand levels and reconciliation." },
  { label: "Admin", text: "Cross-cutting access for setup and administration." },
];

const STATS = [
  { value: "9", label: "Operational modules" },
  { value: "6", label: "Role-based access tiers" },
  { value: "Real-time", label: "Ledger-driven inventory" },
  { value: "AI", label: "Copilot & forecasting" },
];

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-teal-50 text-slate-700">
      {/* ------------------------------ Nav ------------------------------ */}
      <header className="sticky top-0 z-40 border-b border-teal-100 bg-teal-50/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-700 text-white shadow-sm">
              <Boxes className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-slate-950">Mini ERP</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-teal-700">Operations Platform</p>
            </div>
          </a>

          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            <a href="#modules" className="transition hover:text-teal-800">Modules</a>
            <a href="#how" className="transition hover:text-teal-800">How it works</a>
            <a href="#docs" className="transition hover:text-teal-800">Documentation</a>
            <a href="#roles" className="transition hover:text-teal-800">Roles</a>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Link to="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/login">
              <Button size="sm">
                Open dashboard <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-md p-2 text-slate-600 hover:bg-teal-100/70 md:hidden"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="animate-in border-t border-teal-100 bg-teal-50/95 px-4 py-4 md:hidden">
            <div className="flex flex-col gap-3 text-sm font-medium text-slate-700">
              <a href="#modules" onClick={() => setMenuOpen(false)}>Modules</a>
              <a href="#how" onClick={() => setMenuOpen(false)}>How it works</a>
              <a href="#docs" onClick={() => setMenuOpen(false)}>Documentation</a>
              <a href="#roles" onClick={() => setMenuOpen(false)}>Roles</a>
              <Link to="/login" className="mt-2">
                <Button size="sm" className="w-full">Open dashboard <ArrowRight className="h-4 w-4" /></Button>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ------------------------------ Hero ----------------------------- */}
      <section id="top" className="relative overflow-hidden">
        {/* drifting background orbs */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="animate-drift absolute -left-24 top-10 h-72 w-72 rounded-full bg-teal-300/30 blur-3xl" />
          <div className="animate-drift-rev absolute -right-16 top-32 h-80 w-80 rounded-full bg-emerald-300/25 blur-3xl" />
          <div className="animate-float-slow absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-teal-200/40 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white/70 px-3 py-1 text-xs font-semibold text-teal-800 shadow-sm backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> Demand-to-delivery, in one place
            </span>
            <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-5xl">
              The operations platform for{" "}
              <span className="bg-gradient-to-r from-teal-700 to-emerald-600 bg-clip-text text-transparent">
                modern teams
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              Mini ERP unifies sales, purchasing, manufacturing and inventory on a single
              ledger-driven core — with role-based access and an AI copilot built in. Generic by
              design: run it for furniture, retail, food, electronics, or any make-to-order business.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/login">
                <Button size="md" className="px-6">
                  Access the dashboard <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#docs">
                <Button variant="outline" size="md" className="px-6">
                  <BookOpen className="h-4 w-4" /> Read the docs
                </Button>
              </a>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              No setup required — sign in with a one-click demo account.
            </p>
          </div>

          {/* stat strip */}
          <div className="mx-auto mt-14 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4">
            {STATS.map((s, i) => (
              <div
                key={s.label}
                className="animate-rise rounded-lg border border-teal-100 bg-white/80 px-4 py-5 text-center shadow-sm shadow-teal-950/[0.04] backdrop-blur"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <p className="text-2xl font-semibold text-teal-800">{s.value}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------- Modules --------------------------- */}
      <Section id="modules" eyebrow="One platform" title="Everything your operation runs on">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m) => (
            <div
              key={m.title}
              className="group rounded-lg border border-teal-100 bg-white/85 p-5 shadow-sm shadow-teal-950/[0.04] backdrop-blur transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-teal-700 ring-1 ring-teal-100 transition group-hover:bg-teal-100">
                <m.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-900">{m.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">{m.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* --------------------------- How it works ------------------------ */}
      <Section id="how" eyebrow="How to use it" title="From sign-in to insight in four steps" tinted>
        <div className="grid gap-4 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="relative rounded-lg border border-teal-100 bg-white/85 p-5 shadow-sm shadow-teal-950/[0.04] backdrop-blur">
              <span className="text-3xl font-semibold text-teal-200">{s.n}</span>
              <h3 className="mt-2 text-sm font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">{s.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------------------------- Use cases -------------------------- */}
      <Section id="when" eyebrow="When to use it" title="Built for operations-led businesses">
        <div className="grid gap-4 sm:grid-cols-2">
          {USE_CASES.map((u) => (
            <div key={u.title} className="flex gap-4 rounded-lg border border-teal-100 bg-white/85 p-5 shadow-sm shadow-teal-950/[0.04] backdrop-blur">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-teal-700 text-white">
                <u.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{u.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{u.text}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* -------------------------- Documentation ------------------------ */}
      <section id="docs" className="border-y border-teal-100 bg-white/60">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Documentation</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">How to use &amp; when to use Mini ERP</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              A quick-start guide to running the platform end-to-end, and a frank look at where it fits.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {/* How to use */}
            <article className="rounded-lg border border-teal-100 bg-white/90 p-6 shadow-sm shadow-teal-950/[0.04] backdrop-blur sm:p-8">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                  <BookOpen className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">How to use</h3>
              </div>
              <ol className="mt-5 space-y-3">
                {DOC_HOW.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-700 text-[11px] font-semibold text-white">
                      {i + 1}
                    </span>
                    <p className="text-sm leading-6 text-slate-600">{step}</p>
                  </li>
                ))}
              </ol>
            </article>

            {/* When to use */}
            <article className="rounded-lg border border-teal-100 bg-white/90 p-6 shadow-sm shadow-teal-950/[0.04] backdrop-blur sm:p-8">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                  <Layers className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">When to use</h3>
              </div>
              <ul className="mt-5 space-y-3">
                {DOC_WHEN.map((row, i) => (
                  <li key={i} className="flex gap-3">
                    {row.good ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    ) : (
                      <X className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
                    )}
                    <p className="text-sm leading-6 text-slate-600">{row.text}</p>
                  </li>
                ))}
              </ul>
            </article>
          </div>

          {/* capability highlights */}
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <DocHighlight icon={ShieldCheck} title="Role-based access" text="Six access tiers keep every team scoped to what they need — enforced on both client and server." />
            <DocHighlight icon={LineChart} title="Ledger-driven stock" text="Inventory is computed from an immutable movement ledger, so on-hand quantities always reconcile." />
            <DocHighlight icon={PlugZap} title="AI copilot & forecasts" text="Ask natural-language questions about your data and generate demand forecasts on the fly." />
          </div>
        </div>
      </section>

      {/* ------------------------------ Roles ---------------------------- */}
      <Section id="roles" eyebrow="Access control" title="Everyone sees exactly what they should" tinted>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r.label} className="rounded-lg border border-teal-100 bg-white/85 p-5 shadow-sm shadow-teal-950/[0.04] backdrop-blur">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-teal-700" />
                <h3 className="text-sm font-semibold text-slate-900">{r.label}</h3>
              </div>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">{r.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------ CTA ------------------------------ */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl bg-slate-900 px-6 py-14 text-center shadow-2xl shadow-teal-950/30 sm:px-12">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="animate-drift absolute -left-10 top-0 h-56 w-56 rounded-full bg-teal-500/20 blur-3xl" />
            <div className="animate-drift-rev absolute -right-10 bottom-0 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl" />
          </div>
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-white">
              Ready to run your operation on one screen?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-300">
              Sign in with a demo account and explore the Control Tower, modules and AI copilot in seconds.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/login">
                <Button size="md" className="px-6">
                  Access the dashboard <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#docs">
                <Button variant="ghost" size="md" className="px-6 text-slate-200 hover:bg-white/10 hover:text-white">
                  <BookOpen className="h-4 w-4" /> Documentation
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------- Footer ---------------------------- */}
      <footer className="border-t border-teal-100 bg-teal-50/80">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-teal-700 text-white">
              <Boxes className="h-4 w-4" />
            </div>
            <span className="font-semibold text-slate-700">Mini ERP</span>
            <span className="text-slate-400">— Operations Platform</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="#docs" className="transition hover:text-teal-800">Docs</a>
            <a href="#modules" className="transition hover:text-teal-800">Modules</a>
            <Link to="/login" className="transition hover:text-teal-800">Sign in</Link>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 transition hover:text-teal-800">
              <Github className="h-4 w-4" /> Source
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------------------------- Local helpers ---------------------------- */
function Section({
  id,
  eyebrow,
  title,
  children,
  tinted,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  tinted?: boolean;
}) {
  return (
    <section id={id} className={tinted ? "border-y border-teal-100 bg-white/40" : ""}>
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-10 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">{eyebrow}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{title}</h2>
        </div>
        {children}
      </div>
    </section>
  );
}

function DocHighlight({ icon: Icon, title, text }: { icon: typeof ShieldCheck; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-teal-100 bg-teal-50/60 p-5">
      <Icon className="h-5 w-5 text-teal-700" />
      <h4 className="mt-3 text-sm font-semibold text-slate-900">{title}</h4>
      <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}
