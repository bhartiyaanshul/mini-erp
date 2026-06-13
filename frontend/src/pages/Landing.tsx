import { useEffect, useRef, useState, type ReactNode } from "react";
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
  Layers,
  CheckCircle2,
  BookOpen,
  Github,
  Menu,
  X,
  Lock,
  ArrowUpRight,
  ArrowDownRight,
  Check,
  TrendingUp,
  Bot,
  Database,
  Bell,
  Search,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

/* Product-agnostic landing page for the Mini ERP platform. */

const MODULES = [
  { icon: LayoutDashboard, title: "Control Tower", text: "A live read on sales, production and delivery risk — the whole operation on one screen." },
  { icon: ShoppingCart, title: "Sales Orders", text: "Quote → confirm → deliver. Reserve stock on confirmation and track fulfilment to the line." },
  { icon: Truck, title: "Purchasing", text: "Raise POs, receive goods, and reconcile vendor bills against what actually arrived." },
  { icon: Factory, title: "Manufacturing", text: "Make-to-order and make-to-stock work orders driven by BoMs and component availability." },
  { icon: Warehouse, title: "Inventory", text: "Every movement posts to a ledger, so on-hand quantities always reconcile." },
  { icon: Users, title: "Partners", text: "One directory for customers and vendors — contacts, terms and full transaction history." },
  { icon: ScrollText, title: "Audit Trail", text: "An immutable record of who changed what, when. Owner-level visibility into every action." },
  { icon: Sparkles, title: "AI Copilot", text: "Ask in plain language. Get answers, summaries and demand forecasts grounded in your data." },
];

const STEPS = [
  { n: "01", title: "Sign in by role", text: "Owner, Sales, Purchase, Manufacturing or Inventory — each person sees only what they need." },
  { n: "02", title: "Set up the catalogue", text: "Add products and BoMs, register partners, load opening stock once. The ledger takes it from there." },
  { n: "03", title: "Run the daily flow", text: "Confirm orders, raise POs, schedule work orders, receive goods. Stock and statuses update live." },
  { n: "04", title: "Read the tower", text: "The dashboard surfaces shortages and late orders. Ask the copilot anything and forecast demand." },
];

const FIT = [
  { good: true, text: "You run a sales → purchase → production → delivery cycle and want it in one place." },
  { good: true, text: "You need role-based access so each team only sees and edits what's relevant." },
  { good: true, text: "You want inventory that always reconciles because it's driven by an immutable ledger." },
  { good: true, text: "You're outgrowing spreadsheets but don't want heavyweight enterprise ERP." },
  { good: false, text: "You only need accounting or invoicing, with no operations or stock to manage." },
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

const INDUSTRIES = ["Furniture & fabrication", "Wholesale & distribution", "Electronics", "Food production", "Custom assembly", "Make-to-stock"];

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-600 antialiased">
      {/* vivid gradient hairline — the only piece of full-bleed colour up top */}
      <div className="h-1 w-full bg-gradient-to-r from-cyan-400 via-teal-500 to-emerald-500" />

      {/* ------------------------------ Nav ------------------------------ */}
      <header
        className={cn(
          "sticky top-0 z-40 transition-colors duration-300",
          scrolled ? "border-b border-slate-200/80 bg-white/80 backdrop-blur-md" : "border-b border-transparent bg-white/0"
        )}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-600 to-emerald-600 text-white shadow-sm shadow-teal-900/20">
              <Boxes className="h-[18px] w-[18px]" />
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-slate-900">Mini ERP</span>
          </a>

          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <a href="#features" className="transition hover:text-slate-900">Features</a>
            <a href="#modules" className="transition hover:text-slate-900">Modules</a>
            <a href="#how" className="transition hover:text-slate-900">How it works</a>
            <a href="#roles" className="transition hover:text-slate-900">Roles</a>
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Link to="/login">
              <Button variant="ghost" size="sm" className="text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                Sign in
              </Button>
            </Link>
            <Link to="/signup">
              <Button size="sm" className="group bg-slate-900 shadow-sm hover:bg-slate-800">
                Get started <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
          </div>

          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="animate-in border-t border-slate-200 bg-white px-4 py-4 md:hidden">
            <div className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              {[
                ["#features", "Features"],
                ["#modules", "Modules"],
                ["#how", "How it works"],
                ["#roles", "Roles"],
              ].map(([href, label]) => (
                <a key={href} href={href} onClick={() => setMenuOpen(false)} className="rounded-md px-2 py-2 hover:bg-slate-100">
                  {label}
                </a>
              ))}
              <Link to="/signup" className="mt-2" onClick={() => setMenuOpen(false)}>
                <Button size="sm" className="w-full bg-slate-900 hover:bg-slate-800">Get started <ArrowRight className="h-4 w-4" /></Button>
              </Link>
              <Link to="/login" onClick={() => setMenuOpen(false)}>
                <Button variant="outline" size="sm" className="w-full">Sign in</Button>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ------------------------------ Hero ----------------------------- */}
      <section id="top" className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-dotgrid" />
        {/* one soft, static brand glow behind the product shot */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-32 h-[34rem] w-[34rem] rounded-full bg-gradient-to-br from-cyan-200/50 via-teal-200/40 to-emerald-100/30 blur-3xl"
        />

        <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-14 sm:px-6 sm:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1.04fr_1fr]">
            {/* copy */}
            <div>
              <Reveal>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Operations platform · sales → purchase → make → ship
                </span>
              </Reveal>

              <Reveal delay={70}>
                <h1 className="mt-6 text-[2.5rem] font-bold leading-[1.04] tracking-tight text-slate-900 sm:text-5xl lg:text-[3.4rem]">
                  One system for everything you{" "}
                  <span className="text-grad">make, buy, and sell.</span>
                </h1>
              </Reveal>

              <Reveal delay={140}>
                <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-[17px]">
                  Mini ERP ties sales, purchasing, manufacturing and inventory to a single ledger — so
                  on-hand stock, order status and production load are always in sync. Role-based, real-time,
                  with an AI copilot that reads your data.
                </p>
              </Reveal>

              <Reveal delay={210}>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link to="/login">
                    <Button size="md" className="group h-11 w-full px-6 shadow-sm shadow-teal-900/10 sm:w-auto">
                      Explore the live demo
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </Button>
                  </Link>
                  <a href="#how">
                    <Button variant="outline" size="md" className="h-11 w-full border-slate-200 bg-white px-6 text-slate-700 hover:bg-slate-50 sm:w-auto">
                      <BookOpen className="h-4 w-4" /> See how it works
                    </Button>
                  </a>
                </div>
              </Reveal>

              <Reveal delay={280}>
                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-500">
                  {["One-click demo accounts", "Sample data preloaded", "No install"].map((t) => (
                    <span key={t} className="inline-flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-teal-600" /> {t}
                    </span>
                  ))}
                </div>
              </Reveal>
            </div>

            {/* product mockup */}
            <Reveal delay={180}>
              <DashboardMockup />
            </Reveal>
          </div>
        </div>

        {/* industries strip */}
        <div className="relative border-t border-slate-100 bg-slate-50/60">
          <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Built for operations-led teams
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              {INDUSTRIES.map((name) => (
                <span key={name} className="text-sm font-medium text-slate-400 transition-colors hover:text-slate-600">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------- Features --------------------------- */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <Reveal>
          <SectionHead
            eyebrow="The core"
            title="A ledger underneath. Intelligence on top."
            sub="Three things make Mini ERP feel different day to day: stock that always reconciles, procurement that warns you early, and a copilot that actually reads your data."
          />
        </Reveal>

        <div className="mt-16 flex flex-col gap-20">
          <FeatureRow
            eyebrow="Inventory"
            title="Stock that always reconciles"
            text="Nothing is set by hand. Receipts, deliveries, production and counts all post as movements to an immutable ledger — on-hand quantity is the running balance. When the numbers are questioned, you can show exactly how they got there."
            points={["Every movement is auditable", "Running balance per product & location", "No silent overrides, ever"]}
            visual={<LedgerMock />}
          />
          <FeatureRow
            reverse
            eyebrow="Predictive procurement"
            title="Know what to reorder before you run out"
            text="Mini ERP derives average daily usage straight from the ledger, projects days of cover, and flags the date you'll hit zero. One click turns a recommendation into a real purchase or work order."
            points={["Demand from real consumption", "Days-of-cover & stockout dates", "Act on it without leaving the page"]}
            visual={<ForecastMock />}
          />
          <FeatureRow
            eyebrow="AI Copilot"
            title="Ask your operation a question"
            text="The copilot reads your live data through the same APIs the app uses — orders, stock, partners, production. It can read freely, but it never writes on its own: every change is a preview you confirm first."
            points={["Grounded in your real data", "Reads instantly, writes only on confirm", "Respects each user's role"]}
            visual={<CopilotMock />}
          />
        </div>
      </section>

      {/* ----------------------------- Modules --------------------------- */}
      <section id="modules" className="border-y border-slate-100 bg-slate-50/60">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <Reveal>
            <SectionHead
              eyebrow="The toolkit"
              title="Every part of the operation, in one place"
              sub="Eight modules that share one source of truth — so confirming a sale, building it, and shipping it are the same story, not three disconnected systems."
            />
          </Reveal>
          <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map((m, i) => (
              <Reveal key={m.title} delay={(i % 4) * 60} className="bg-white">
                <div className="group h-full p-6 transition-colors hover:bg-slate-50">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-100 transition-colors group-hover:bg-teal-600 group-hover:text-white group-hover:ring-teal-600">
                    <m.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-slate-900">{m.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-500">{m.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------- How it works ------------------------ */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <Reveal>
          <SectionHead eyebrow="How it works" title="From sign-in to insight in four steps" />
        </Reveal>
        <div className="relative mt-14">
          {/* connector line */}
          <div aria-hidden className="absolute left-0 right-0 top-5 hidden h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent lg:block" />
          <div className="grid gap-8 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 80}>
                <div className="relative">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-teal-700 shadow-sm">
                    {s.n}
                  </div>
                  <h3 className="mt-5 text-[15px] font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{s.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------ Fit ------------------------------ */}
      <section className="border-y border-slate-100 bg-slate-50/60">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
            <Reveal>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Is it a fit?</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">An honest look at where Mini ERP fits</h2>
                <p className="mt-4 max-w-md text-sm leading-7 text-slate-600">
                  It's built for businesses that physically make, buy and move things — and that have outgrown
                  spreadsheets. If that's not you, we'd rather say so.
                </p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <ul className="grid gap-3 sm:grid-cols-2">
                {FIT.map((row, i) => (
                  <li
                    key={i}
                    className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.02]"
                  >
                    {row.good ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    ) : (
                      <X className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
                    )}
                    <p className="text-sm leading-6 text-slate-600">{row.text}</p>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ------------------------------ Roles ---------------------------- */}
      <section id="roles" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <Reveal>
          <SectionHead
            eyebrow="Access control"
            title="Everyone sees exactly what they should"
            sub="Six role tiers, enforced on both the client and the server. People get the modules and actions their job needs — nothing more."
          />
        </Reveal>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map((r, i) => (
            <Reveal key={r.label} delay={(i % 3) * 60}>
              <div className="h-full rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-900/5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-teal-600" />
                  <h3 className="text-sm font-semibold text-slate-900">{r.label}</h3>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">{r.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------------ CTA ------------------------------ */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-slate-900 px-6 py-16 sm:px-14">
            <div
              aria-hidden
              className="animate-pan pointer-events-none absolute inset-0 opacity-70"
              style={{
                backgroundImage:
                  "radial-gradient(40rem 20rem at 15% 0%, rgba(20,184,166,0.35), transparent 60%), radial-gradient(36rem 20rem at 90% 110%, rgba(16,185,129,0.32), transparent 55%)",
              }}
            />
            <div className="relative mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Run your whole operation on one screen.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[15px] leading-7 text-slate-300">
                Sign in with a demo account and explore the Control Tower, every module and the AI copilot —
                with sample data already loaded.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link to="/login">
                  <Button size="md" className="group h-11 bg-white px-6 !text-slate-900 hover:bg-slate-100">
                    Explore the live demo
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button variant="ghost" size="md" className="h-11 px-6 !text-slate-200 hover:bg-white/10 hover:!text-white">
                    Create a company
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ----------------------------- Footer ---------------------------- */}
      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-600 to-emerald-600 text-white">
                  <Boxes className="h-[18px] w-[18px]" />
                </div>
                <span className="text-[15px] font-semibold tracking-tight text-slate-900">Mini ERP</span>
              </div>
              <p className="mt-4 max-w-xs text-sm leading-6 text-slate-500">
                The ledger-driven operations platform for teams that make, buy and sell — with an AI copilot built in.
              </p>
            </div>
            <FooterCol title="Product" links={[["Features", "#features"], ["Modules", "#modules"], ["How it works", "#how"], ["Roles", "#roles"]]} />
            <FooterCol title="Get started" links={[["Live demo", "/login", true], ["Create company", "/signup", true], ["Documentation", "#how"]]} />
            <FooterCol title="More" links={[["Sign in", "/login", true], ["Source", "https://github.com"]]} />
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-100 pt-6 text-sm text-slate-400 sm:flex-row">
            <p>© {YEAR} Mini ERP — Operations Platform.</p>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 transition hover:text-slate-600">
              <Github className="h-4 w-4" /> Source
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const YEAR = 2026;

/* ============================ Reveal wrapper =========================== */
/* Fades + lifts content into place once, the first time it enters view.  */
function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-all duration-700 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0 motion-reduce:opacity-100",
        className
      )}
    >
      {children}
    </div>
  );
}

/* ============================ Section header =========================== */
function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-[2.1rem]">{title}</h2>
      {sub && <p className="mt-4 text-[15px] leading-7 text-slate-600">{sub}</p>}
    </div>
  );
}

/* ============================= Feature row ============================ */
function FeatureRow({
  eyebrow,
  title,
  text,
  points,
  visual,
  reverse,
}: {
  eyebrow: string;
  title: string;
  text: string;
  points: string[];
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <Reveal className={cn(reverse && "lg:order-2")}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">{eyebrow}</p>
          <h3 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.7rem]">{title}</h3>
          <p className="mt-4 text-[15px] leading-7 text-slate-600">{text}</p>
          <ul className="mt-6 space-y-2.5">
            {points.map((p) => (
              <li key={p} className="flex items-center gap-2.5 text-sm text-slate-700">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-600 ring-1 ring-teal-100">
                  <Check className="h-3 w-3" />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
      <Reveal delay={120} className={cn(reverse && "lg:order-1")}>
        {visual}
      </Reveal>
    </div>
  );
}

/* ============================ Footer column =========================== */
function FooterCol({ title, links }: { title: string; links: Array<[string, string, boolean?]> }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{title}</p>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map(([label, href, internal]) => (
          <li key={label}>
            {internal ? (
              <Link to={href} className="text-slate-600 transition hover:text-teal-700">{label}</Link>
            ) : (
              <a href={href} className="text-slate-600 transition hover:text-teal-700">{label}</a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ===================================================================== */
/* ============================== Mockups ============================== */
/* ===================================================================== */

/** Chrome shell shared by every product mockup — a tidy browser frame. */
function BrowserFrame({ url, children, className }: { url: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5", className)}>
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-3.5 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
        <div className="ml-2 flex flex-1 justify-center">
          <div className="flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-[10px] font-medium text-slate-400 ring-1 ring-slate-200">
            <Lock className="h-2.5 w-2.5" /> {url}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

const HERO_BARS = [40, 56, 47, 64, 52, 73, 60, 82, 70, 91];
const HERO_KPIS = [
  { label: "Revenue · 30d", value: "₹8.42L", delta: "+12.4%", up: true },
  { label: "Open orders", value: "37", delta: "+5", up: true },
  { label: "On-time ship", value: "96%", delta: "+2.1%", up: true },
  { label: "Stock alerts", value: "4", delta: "−3", up: false },
];
const HERO_ALERTS = [
  { name: "Steel Sheet 2mm", tone: "amber", note: "6 days cover" },
  { name: "Hex Bolt M6", tone: "rose", note: "2 days cover" },
  { name: "Hinge 90°", tone: "amber", note: "5 days cover" },
];

/** The hero's centrepiece: a believable Control Tower dashboard. */
function DashboardMockup() {
  const NAV = [
    { icon: LayoutDashboard, label: "Dashboard", active: true },
    { icon: ShoppingCart, label: "Sales" },
    { icon: Truck, label: "Purchasing" },
    { icon: Factory, label: "Manufacturing" },
    { icon: Warehouse, label: "Inventory" },
    { icon: Users, label: "Partners" },
  ];
  return (
    <div className="relative">
      <div aria-hidden className="absolute -inset-5 -z-10 rounded-[2rem] bg-gradient-to-tr from-cyan-300/25 via-teal-300/25 to-emerald-200/25 blur-2xl" />
      <BrowserFrame url="minierp.app/dashboard">
        <div className="flex">
          {/* sidebar */}
          <aside className="hidden w-36 shrink-0 border-r border-slate-100 bg-slate-50/50 p-2.5 sm:block">
            <div className="flex items-center gap-1.5 px-1.5 py-1">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br from-teal-600 to-emerald-600 text-white">
                <Boxes className="h-3 w-3" />
              </div>
              <span className="text-[11px] font-semibold text-slate-700">Mini ERP</span>
            </div>
            <div className="mt-2 space-y-0.5">
              {NAV.map((n) => (
                <div
                  key={n.label}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-1.5 py-1.5 text-[11px] font-medium",
                    n.active ? "bg-teal-600 text-white" : "text-slate-500"
                  )}
                >
                  <n.icon className="h-3 w-3" /> {n.label}
                </div>
              ))}
            </div>
          </aside>

          {/* main */}
          <div className="min-w-0 flex-1 p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-semibold text-slate-800">Control Tower</p>
                <p className="text-[10px] text-slate-400">Saturday, 14 June</p>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="hidden items-center gap-1 rounded-md bg-slate-100 px-1.5 py-1 text-[9px] text-slate-400 sm:flex">
                  <Search className="h-2.5 w-2.5" /> Search
                </div>
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-slate-400">
                  <Bell className="h-2.5 w-2.5" />
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {HERO_KPIS.map((k) => (
                <div key={k.label} className="rounded-lg border border-slate-100 bg-white p-2">
                  <p className="truncate text-[9px] font-medium text-slate-400">{k.label}</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-800">{k.value}</p>
                  <p className={cn("mt-0.5 inline-flex items-center gap-0.5 text-[9px] font-semibold", k.up ? "text-emerald-600" : "text-rose-500")}>
                    {k.up ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                    {k.delta}
                  </p>
                </div>
              ))}
            </div>

            {/* chart + alerts */}
            <div className="mt-2.5 grid gap-2 lg:grid-cols-[1.5fr_1fr]">
              <div className="rounded-lg border border-slate-100 bg-white p-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-slate-600">Revenue · last 10 weeks</p>
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-emerald-600">
                    <TrendingUp className="h-2.5 w-2.5" /> trending up
                  </span>
                </div>
                <div className="mt-2 flex h-20 items-end gap-1.5">
                  {HERO_BARS.map((h, i) => (
                    <div
                      key={i}
                      className="animate-grow-bar flex-1 rounded-sm bg-gradient-to-t from-teal-600 to-emerald-400"
                      style={{ height: `${h}%`, animationDelay: `${300 + i * 70}ms` }}
                    />
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-slate-100 bg-white p-2.5">
                <p className="text-[10px] font-semibold text-slate-600">Reorder alerts</p>
                <div className="mt-2 space-y-1.5">
                  {HERO_ALERTS.map((a) => (
                    <div key={a.name} className="flex items-center gap-1.5">
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", a.tone === "rose" ? "bg-rose-500" : "bg-amber-400")} />
                      <span className="min-w-0 flex-1 truncate text-[10px] text-slate-600">{a.name}</span>
                      <span className="shrink-0 text-[9px] text-slate-400">{a.note}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </BrowserFrame>
    </div>
  );
}

const LEDGER_ROWS = [
  { date: "Jun 02", move: "Opening balance", qty: "", bal: "400", tone: "slate" },
  { date: "Jun 05", move: "PO receipt · #PO-118", qty: "+250", bal: "650", tone: "emerald" },
  { date: "Jun 08", move: "SO delivery · #SO-204", qty: "−180", bal: "470", tone: "rose" },
  { date: "Jun 11", move: "MO consume · #MO-061", qty: "−120", bal: "350", tone: "rose" },
];

/** Inventory ledger snippet — sells the "always reconciles" claim. */
function LedgerMock() {
  return (
    <BrowserFrame url="minierp.app/inventory" className="shadow-lg">
      <div className="p-4">
        <div className="flex items-center gap-2">
          <Database className="h-3.5 w-3.5 text-teal-600" />
          <p className="text-[12px] font-semibold text-slate-800">Steel Sheet 2mm · ledger</p>
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-100">
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 bg-slate-50 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Date</span><span>Movement</span><span className="text-right">Qty</span><span className="text-right">Balance</span>
          </div>
          {LEDGER_ROWS.map((r, i) => (
            <div key={i} className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 border-t border-slate-100 px-3 py-2 text-[11px]">
              <span className="text-slate-400">{r.date}</span>
              <span className="text-slate-600">{r.move}</span>
              <span className={cn("text-right font-medium", r.tone === "emerald" ? "text-emerald-600" : r.tone === "rose" ? "text-rose-500" : "text-slate-400")}>
                {r.qty || "—"}
              </span>
              <span className="text-right font-semibold text-slate-700">{r.bal}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-teal-50 px-3 py-2 ring-1 ring-teal-100">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-teal-800">
            <CheckCircle2 className="h-3.5 w-3.5" /> On hand reconciled
          </span>
          <span className="text-[13px] font-bold text-teal-800">350 units</span>
        </div>
      </div>
    </BrowserFrame>
  );
}

/** Forecast / predictive procurement snippet. */
function ForecastMock() {
  const SPARK = [22, 30, 26, 38, 34, 46, 52];
  return (
    <BrowserFrame url="minierp.app/forecast" className="shadow-lg">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-teal-600" />
            <p className="text-[12px] font-semibold text-slate-800">Hex Bolt M6 · forecast</p>
          </div>
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-semibold text-rose-600 ring-1 ring-rose-100">At risk</span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Avg daily use", value: "240" },
            { label: "Days of cover", value: "2.0", warn: true },
            { label: "Stockout", value: "Jun 16", warn: true },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-slate-100 bg-white p-2">
              <p className={cn("text-sm font-bold", s.warn ? "text-rose-500" : "text-slate-800")}>{s.value}</p>
              <p className="mt-0.5 text-[9px] text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>

        {/* days-of-cover bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[9px] text-slate-400">
            <span>Days of cover</span><span>target 14d</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-[14%] rounded-full bg-gradient-to-r from-rose-400 to-rose-500" />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50/70 px-3 py-2">
          <div>
            <p className="text-[9px] uppercase tracking-wide text-teal-700">Suggested reorder</p>
            <p className="text-[13px] font-bold text-teal-900">480 units</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-md bg-teal-600 px-2.5 py-1.5 text-[10px] font-semibold text-white">
            Create PO <ArrowRight className="h-3 w-3" />
          </span>
        </div>

        {/* tiny sparkline of demand */}
        <div className="mt-3 flex h-10 items-end gap-1">
          {SPARK.map((h, i) => (
            <div key={i} className="flex-1 rounded-sm bg-teal-200" style={{ height: `${h * 1.6}%` }} />
          ))}
        </div>
      </div>
    </BrowserFrame>
  );
}

/** AI copilot chat snippet — reflects the real read-then-confirm flow. */
function CopilotMock() {
  return (
    <BrowserFrame url="minierp.app/copilot" className="shadow-lg">
      <div className="flex flex-col gap-3 bg-slate-50/40 p-4">
        {/* user */}
        <div className="self-end rounded-2xl rounded-br-sm bg-teal-600 px-3.5 py-2 text-[11px] text-white shadow-sm">
          Which products will stock out this week?
        </div>

        {/* tool trace */}
        <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[9px] font-medium text-slate-400 ring-1 ring-slate-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> read · inventory + forecast
        </div>

        {/* assistant */}
        <div className="max-w-[88%] self-start rounded-2xl rounded-bl-sm bg-white px-3.5 py-2.5 text-[11px] leading-relaxed text-slate-600 shadow-sm ring-1 ring-slate-100">
          <p className="flex items-center gap-1.5 font-semibold text-slate-800">
            <Bot className="h-3.5 w-3.5 text-teal-600" /> Two items are at risk:
          </p>
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1">
              <span>Hex Bolt M6</span><span className="font-semibold text-rose-500">2 days</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1">
              <span>Steel Sheet 2mm</span><span className="font-semibold text-amber-500">6 days</span>
            </div>
          </div>
          <p className="mt-2">Want me to draft purchase orders for both?</p>
        </div>

        {/* input */}
        <div className="mt-1 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
          <span className="flex-1 text-[10px] text-slate-400">Ask anything about your data…</span>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-white">
            <Send className="h-2.5 w-2.5" />
          </span>
        </div>
      </div>
    </BrowserFrame>
  );
}
