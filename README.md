# Mini ERP

A modular, **ledger-based** ERP that ties **Sales, Purchase, Manufacturing and Inventory** into one real-time system — and then does the things spreadsheets can't: it sees a shortage coming, raises the right replenishment on its own, prints the paperwork, and can be driven in plain English.

> **The one idea everything else hangs off:** stock is never a number you store and edit. It's an immutable ledger of moves, and every quantity you see — on-hand, reserved, free-to-use, inventory value, even what you had in stock last Tuesday — is *derived* from that ledger. Same principle as a bank statement, applied to inventory. You get real-time accuracy, full traceability, and an audit trail for free.

It's built around a furniture manufacturer ("Shiv Furniture Works", which ships as the demo tenant), but it's multi-tenant — anyone can sign up and get their own isolated company.

The spine of the product is four layers, each built on the one before it:

**Ledger → Automation → Prediction → Copilot**

1. **Ledger** — one append-only `StockMove` table is the source of truth.
2. **Automation** — when an order can't be fulfilled, the system raises a Manufacturing Order (if you make the item) or a Purchase Order (if you buy it), automatically.
3. **Prediction** — it reads demand history off the same ledger and tells you what's going to run out *before* it does.
4. **Copilot** — a role-aware assistant that can read the whole business and *draft* actions for a human to confirm. It can never silently change your data.

---

## What's inside

**Sales & fulfilment.** Sale orders in two flavours: make-to-stock (deliver from what's on hand) and make-to-order (confirming reserves what stock it can and procures the rest). Confirming posts reservations; delivering posts the outbound moves. Every order also gets a public **"track your order like a package"** link — a signed token, no login required for the customer.

**Purchase.** Purchase orders with partial or full receipt. Receiving posts inbound moves and raises on-hand.

**Manufacturing.** Manufacturing Orders backed by a Bill of Materials (components *and* operations / work centres). Completing an MO consumes the components and produces the finished good — all as ledger moves, so the stock impact is exact and auditable. Work orders track shop-floor progress.

**Inventory.** No stored stock column anywhere. `on_hand`, `reserved`, `free_to_use` and valuation are all computed from the ledger on read. Each product has an audit timeline that reads like a story: created → reserved → manufactured → delivered → returned.

**Returns / RMA.** The reverse of the sale flow. A return restocks goods (inbound moves) and can scrap the unsellable portion (outbound write-off), against a specific delivered order, and stamps the credit owed at the original sale price. "Already returned" is *derived* from completed returns, so multiple partial returns against one order stay correct.

**Inventory Time Machine.** Pick any moment in the past and the system replays physical on-hand and valuation from the ledger's `done_at` stamps. The past is computed, never stored — so it's always consistent with the present. Includes a timelapse view.

**Branded documents.** One-click PDFs — Sale Order / Quotation, Tax Invoice, Delivery Note, Purchase Order, and the MO traveler — generated server-side, then downloaded or emailed straight to the counterparty. Your company branding (logo, address, GSTIN, accent colour, invoice footer) prints on all of them.

**Predictive procurement.** Reads demand off the ledger as an average daily usage, projects days-of-cover and a stockout date per product, and suggests a reorder quantity plus the right strategy (buy vs. make). One click turns a recommendation into a real PO or MO. An AI layer narrates the briefing in plain English — and falls back to a templated summary when no AI key is set, so it works either way.

**AI Copilot.** Ask the business questions in plain English ("what's running low?", "draft a PO for 50 chairs"). The assistant reads freely through the existing services, but **it can never mutate directly** — to change anything it emits a proposal you review and confirm, and the real write then runs through the normal, RBAC-checked code path.

**Control-tower dashboard.** Live operational metrics: revenue and spend computed from the ledger, a 30-day trend, top products, and open-order orchestration — all updating in real time over WebSocket.

**Admin & access.** Per-module role-based access control, multi-tenant signup with email OTP verification, company branding settings, a full audit log, and global search.

---

## Tech stack

- **Backend** — FastAPI + SQLModel, laid out in clean layers: `routers → services → models`. SQLite by default; point `DATABASE_URL` at Postgres and nothing else changes.
- **Auth** — JWT (PyJWT) with per-module access dependencies. Passwords hashed with pbkdf2 via passlib. (No native crypto deps — see [Design notes](#design-notes-the-non-obvious-bits).)
- **Realtime** — native FastAPI WebSocket. Broadcasts are fire-and-forget, off the request path, so they never slow a write.
- **AI** — Groq (Llama 3.3 70B for narration, a smaller tool-calling model for the Copilot). Entirely optional — every AI feature degrades gracefully without a key.
- **PDFs** — reportlab (pure-Python, no system libraries to install).
- **Frontend** — Vite + React + TypeScript, Tailwind, TanStack Query, Recharts, react-router, sonner toasts.

---

## Repo layout

This is a monorepo (`mini-erp-monorepo`): backend and frontend live side by side.

```
backend/
  app/
    core/        # config, db, auth deps, security, validation
    models/      # SQLModel tables + enums (StockMove, SaleOrder, BoM, …)
    routers/     # one module per HTTP surface (sales, purchase, returns, …)
    services/    # the business logic — inventory, procurement, forecast, …
    events/      # WebSocket manager + in-process event bus
    schemas.py   # request/response models
    serializers.py
  smoke_test.py  # end-to-end backend test (see below)
frontend/
  src/
    pages/       # one per screen (Sales, Manufacturing, TimeMachine, …)
    components/   # Layout, Copilot, DocumentActions, OrderJourney, ui kit
    lib/         # api client, queries, types, access helpers
```

---

## Running it locally

You need Python 3.11+ and Node 18+. Two terminals.

**Backend** (terminal 1):

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --port 8000
```

**Frontend** (terminal 2):

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173  (proxies /api and /ws to :8000)
```

Then open **http://localhost:5173**. The database, schema and demo users are all created automatically on first boot — there's no migration step to run.

### Configuration

Everything has a sensible dev default, so the app runs with **zero configuration**. To change anything, drop a `.env` in `backend/`:

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./mini_erp.db` | Swap in a Postgres DSN for production. |
| `JWT_SECRET` | `dev-secret-change-me` | **Change this** for any real deployment. |
| `CORS_ORIGINS` | `localhost:5173,127.0.0.1:5173` | Comma-separated allowed origins. |
| `GROQ_API_KEY` | *(empty)* | Enables AI narration + Copilot. Empty = templated fallback. |
| `SMTP_HOST` etc. | *(empty)* | Enables real signup OTP + document email. Empty = dev fallback (the OTP is logged to the console and returned as `dev_otp`, so signup works without a mail server). |
| `FORECAST_LOOKBACK_DAYS` | `30` | Demand window for the forecast. |

See [`backend/app/core/config.py`](backend/app/core/config.py) for the full list.

---

## Signing in

### Demo accounts

Six users are seeded into the demo company on startup. The password for all of them is **`demo1234`**, and the login screen has one-click **Quick login** chips for each.

| Role | Email | Access |
|---|---|---|
| System Admin | `admin@shivfurniture.com` | everything |
| Business Owner | `owner@shivfurniture.com` | everything |
| Sales | `sales@shivfurniture.com` | Sales (admin), Products (view) |
| Purchase | `purchase@shivfurniture.com` | Purchase (admin), Products (view) |
| Manufacturing | `mfg@shivfurniture.com` | Manufacturing (admin), Products (view) |
| Inventory | `inventory@shivfurniture.com` | Products (admin) |

Access is **per module**, not a single global role. The four modules — Sales, Purchase, Manufacturing, Products — each have three levels (none → user → admin), and a System Admin bypasses the grid entirely. So the Sales user simply doesn't see Manufacturing or the Audit log in their nav.

### Loading the demo scenario

Log in as **Admin** or **Owner** and click **"Load Demo Scenario"** in the top bar. This seeds the furniture business: products, the Wooden Table BoM (4 Legs + 1 Top + 12 Screws; Assembly / Painting / Packing operations), vendors, customers, opening stock, and about a month of historical orders so the dashboard and forecast render fully. Re-click any time to reset the business data (your user stays logged in).

### Or sign up your own tenant

Hit **Sign up** from the landing page. You give a company name and your details, verify a 6-digit code (emailed if SMTP is configured, otherwise shown to you directly), and you land in a brand-new, empty, isolated company as its owner.

---

## The demo script

The run that tells the whole story in about three minutes:

1. **Log in as Sales** — note the restricted nav (no Manufacturing, no Audit).
2. **Make-to-stock:** create a sale order for **3 Wooden Tables** → confirm (reserves from the 5 on hand) → deliver. Fully delivered; on-hand drops.
3. **Make-to-order (the money shot):** create a sale order for **20 Wooden Tables** → confirm. With only a couple on hand, the system reserves what it can and **auto-creates a Manufacturing Order for the shortage**. A toast announces it, and the dashboard ticks up live in another tab.
4. **Log in as Manufacturing** → open the MO → **Complete** it. Components are consumed and finished tables produced (Legs −, Top −, Screws −, Tables +), every movement through the ledger.
5. **Make-to-order (buy):** a large **Office Chair** order auto-creates a **Purchase Order** instead. Log in as Purchase → **Receive** → on-hand rises.
6. **Owner view:** the dashboard shows it all live; open a product's **audit timeline** for its full history; rewind the **Time Machine** to see stock as it was before the run.
7. **Close on:** *"every number you just saw is derived from one immutable ledger — fully auditable, real-time, and Postgres-ready."*

---

## How it works

A few mechanics worth knowing, with the real entry points.

**The ledger is the only write path.** `inventory_service.create_move` is the single function that appends to `StockMove`; `inventory_service.get_availability` derives `on_hand` / `reserved` / `free_to_use` from those rows. Nothing else writes stock. That's what makes the audit trail and the Time Machine possible — there's literally no other way for a quantity to change.

**Procurement is the automation.** `procurement_service.procure` runs when a sale order is short. Per the product's strategy it raises an auto-confirmed Manufacturing Order (make) or Purchase Order (buy), and it handles mixed lines correctly — reserve what's available, procure exactly the remainder.

**Forecasting reuses the ledger.** `forecast_service` reads done outbound moves over a lookback window, turns them into an average daily usage, and projects the stockout date and a reorder quantity. The numbers are computed deterministically; `ai_service` only narrates them, so the forecast is the same with or without an AI key.

**The Copilot can read but not write.** `assistant_service` gives the model read tools that auto-execute, but any change is a `propose_*` tool that merely validates and previews. The real mutation happens later, through the same services and the same RBAC checks as a human click.

**Multi-tenancy is by `company_id`.** Every business record carries one, and every query is scoped to it, so tenants can never see each other's data.

**Realtime is off the critical path.** Services do the DB work, the request commits once, *then* an event is broadcast over WebSocket. A slow or dead socket can never delay or fail a write.

---

## Verifying

There's an end-to-end backend smoke test that runs the whole demo story in-process against a fresh database — auth and RBAC, the demo seed, MTS delivery, MTO-with-manufacture (auto-MO), MO completion, MTO-with-buy (auto-PO), receipt, dashboard metrics, and the per-product audit timeline:

```bash
cd backend && .venv/bin/python smoke_test.py
```

The frontend type-checks and builds with:

```bash
cd frontend && npm run build
```

---

## Design notes (the non-obvious bits)

A few decisions that look odd until you know why:

- **No native-crypto dependencies.** Auth uses PyJWT + pbkdf2 rather than `cryptography`/`bcrypt`, so the backend installs cleanly on a machine with no Rust toolchain.
- **PDFs print "Rs." not "₹".** reportlab's built-in Helvetica has no rupee glyph and would render a tofu box, so documents use `Rs.` with Indian digit grouping while the web UI keeps `₹`.
- **AI is always optional.** Both the forecast briefing and the Copilot degrade to non-AI behaviour when `GROQ_API_KEY` is unset — the app never depends on a third-party key to function.
- **Email is always optional too.** Without SMTP, signup OTPs are surfaced via the dev path and document email tells you the PDF still downloaded, so nothing dead-ends.

This started as a hackathon build, so the defaults favour "clone and it just runs" over production hardening — set a real `JWT_SECRET` and a Postgres `DATABASE_URL` before putting it anywhere public.
