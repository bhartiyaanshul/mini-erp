# Shiv Furniture Works — Mini ERP

A modular, **ledger-based** Mini ERP connecting **Sales, Purchase, Manufacturing, and Inventory** into one real-time system, with **automated procurement (MTS/MTO)** as the centerpiece.

> **Core idea:** stock is never a stored number. It's an immutable ledger of moves, and every on-hand / reserved / free-to-use quantity is *derived* from that ledger — giving real-time accuracy, full traceability, and audit logs for free.

## Stack

- **Backend:** FastAPI + SQLModel, layered `routers → services → models`. SQLite by default, Postgres-ready via a single `DATABASE_URL`.
- **Auth:** JWT (PyJWT) + role-based dependencies. Six roles: Admin, Sales, Purchase, Manufacturing, Inventory, Owner.
- **Realtime:** native FastAPI WebSocket, fire-and-forget broadcast off the request path.
- **Frontend:** Vite + React + TypeScript, Tailwind, TanStack Query, Recharts, sonner toasts.

## Run it

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

Open http://localhost:5173.

## Demo accounts

The six role users are seeded automatically on startup. Password for all: **`demo1234`**.

| Role | Email |
|------|-------|
| Admin | admin@shivfurniture.com |
| Sales | sales@shivfurniture.com |
| Purchase | purchase@shivfurniture.com |
| Manufacturing | mfg@shivfurniture.com |
| Inventory | inventory@shivfurniture.com |
| Business Owner | owner@shivfurniture.com |

The login screen has one-click **Quick login** chips for each role.

## Loading the demo scenario

Log in as **Admin** → click **"Load Demo Scenario"** (top bar). This seeds Shiv Furniture: products, the Wooden Table BoM (4 Legs + 1 Top + 12 Screws; Assembly/Painting/Packing), vendors, customers, and opening stock — arranged for a clean demo. (Re-click anytime to reset business data.)

## Demo script (the winning run)

1. **Login as Sales** — show restricted access (no Manufacturing/Audit in the nav).
2. **MTS:** create a sale order for **3 Wooden Tables** → confirm (reserves from the 5 on hand) → deliver → fully delivered, on-hand drops.
3. **MTO (the money shot):** create a sale order for **20 Wooden Tables** → confirm. With only a few on hand, the system reserves what it can and **auto-creates a Manufacturing Order for the shortage** — a toast announces it and the dashboard ticks up live in another tab.
4. **Login as Manufacturing** → open the MO → **Complete MO**: components are consumed and finished tables produced (Legs −, Top −, Screws −, Tables +), all through the ledger.
5. **MTO (buy):** a large **Office Chair** order auto-creates a **Purchase Order**; login as Purchase → **Receive** → on-hand rises.
6. **Owner:** the **Dashboard** shows everything live; **Products → audit timeline** shows a product's full story (created → reserved → manufactured → delivered).
7. **Close:** "every number you saw is derived from an immutable ledger — fully auditable, real-time, and Postgres-ready."

## Verifying

A full end-to-end backend smoke test (auth/RBAC, MTS, MTO-manufacture, MO completion, MTO-buy, receive, dashboard, audit timeline):
```bash
cd backend && .venv/bin/python smoke_test.py
```

## Architecture notes

- **`inventory_service`** is the heart: `get_availability` derives on_hand/reserved/free from `StockMove` rows; `create_move` is the only write path.
- **`procurement_service.procure`** is the automation: on a sale-order shortage it creates an auto-confirmed MO (manufacture) or PO (buy) per the product's strategy, handling mixed lines (reserve N, procure the rest).
- Services do the DB work; the request commits once, then events broadcast over WebSocket — never in the critical path.
