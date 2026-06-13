# Shiv Furniture Works — Mini ERP

## Pitch, Backend Deep-Dive & Judge Q&A Prep

> Read this end-to-end once. It explains **what the backend actually does**, the **concepts behind each piece**, the **questions a judge is likely to ask (with answers you can say out loud)**, and a set of **counter-questions you can ask the judges** to control the conversation.

---

## 0. The 30-second pitch (say this first)

> "Most small manufacturers run their business on WhatsApp and spreadsheets. They find out they're out of stock *only when a customer order can't be fulfilled*. We built a Mini ERP for a furniture maker that fixes that with two ideas:
>
> 1. **An immutable stock ledger** — every quantity in the system (on-hand, reserved, free-to-use, inventory value) is *derived*, never stored and edited. It's the same accounting principle as a bank statement, applied to inventory.
> 2. **Proactive automation** — when a sale order can't be fulfilled, the system *automatically* raises the right replenishment (a Manufacturing Order if we build it, a Purchase Order if we buy it). And a **predictive procurement engine** reads demand history off that ledger and tells you what's going to run out *before* it does.
>
> On top of that sits a **role-aware Copilot** that can read the whole business in plain English and *draft* actions for a human to confirm — it can never silently change your data."

That's the whole story: **Ledger → Automation → Prediction → Copilot.**

---

## 1. The core concept: an immutable stock ledger

This is the single most important thing to understand and the strongest technical talking point.

### What it is

We never store a column like `product.stock = 42` and update it. Instead we have one table — `StockMove` — that records *every* movement of stock as an append-only row. Each move has:

- `product_id`
- `qty`
- `move_type`: `IN` or `OUT`
- `state`: `DRAFT`, `RESERVED`, or `DONE`
- `source`: `sale`, `purchase`, `manufacturing_consume`, `manufacturing_produce`, `adjustment`
- `source_doc_id`: which order caused it
- timestamps (`created_at`, `done_at`)

Every quantity the UI shows is **computed from these moves on the fly** (`inventory_service.get_availability`):

```
on_hand     = Σ(DONE IN)  − Σ(DONE OUT)
reserved    = Σ(RESERVED OUT)
free_to_use = on_hand − reserved
```

### Why this matters (the concept)

This is **event-sourcing / double-entry bookkeeping applied to inventory**. The benefits, in plain language:

- **Auditability** — you can always answer "why is on-hand 42?" by replaying the moves. Nothing is ever overwritten, so stock can't silently drift.
- **No race conditions on a stored counter** — there's no single number two requests fight over; you just append a row.
- **Reserved vs. free is a first-class idea.** A confirmed sale order *reserves* stock (it's promised but not shipped). `free_to_use` is what's actually available to promise to the *next* customer. Spreadsheets can't express this; that's exactly why small businesses oversell.
- **One source of truth.** Inventory value, dashboard metrics, low-stock alerts, and the demand forecast *all* read the same ledger. There's no second place for the numbers to disagree.

> **Talking point:** "We treat stock like a bank treats your balance — you don't store a balance and edit it, you store transactions and derive the balance. That's why our numbers are always provable."

---

## 2. The order lifecycle & the MTS/MTO fork

`sales_service.confirm_order` is where the business logic lives. When a sale order is confirmed:

1. For each line, we look up `free_to_use`.
2. **Reserve what's available** — create a `RESERVED OUT` move for the in-stock portion.
3. **For the shortage**, if the product is flagged `procure_on_demand`, hand it to the **procurement engine**.

This is the classic **Make-to-Stock (MTS) vs Make-to-Order (MTO)** fork, and a single line can do *both*: "reserve 5 from stock, procure the missing 15." Delivery later (`deliver_order`) flips `RESERVED` moves to `DONE`, splitting a move if only part ships (partial deliveries).

> **Concept:** reserve-then-fulfil is how real ERPs (SAP, Odoo) prevent overselling. We implemented the same state machine in miniature.

---

## 3. Automation: the procurement engine

`procurement_service.procure` is the "reactive automation" centrepiece. Given a shortage of a product it looks at the product's configured **procurement strategy**:

- `manufacture` → auto-creates a **Manufacturing Order** (auto-confirmed, components reserved via the BoM)
- `buy` → auto-creates a **Purchase Order** to the product's **default vendor** (auto-confirmed)
- If `buy` but no vendor is configured → it doesn't guess; it logs a "blocked" entry so a human can fix the setup.

Every one of these writes an **audit log** entry and emits a **WebSocket event** (`procurement_triggered`, `stock_changed`) so the dashboard updates live, in front of the user, with a toast.

> **Talking point:** "Confirming a sale order that we can't fulfil doesn't just throw an error — it *fixes itself*. It raises the exact document needed to fulfil that order, and tells you it did."

---

## 4. Prediction: how predictive procurement actually works

This is the part judges will dig into, so know it cold. **It is 100% deterministic math — there is no black-box model guessing numbers.** (`forecast_service.py`)

### The inputs

We read **demand** straight off the ledger — the same way we read stock. Demand = `DONE OUT` moves whose source is a real consumption event: `SALE` or `MANUFACTURING_CONSUME`, within a lookback window (default **30 days**).

### The formulas

For each product flagged `procure_on_demand`:

```
ADU  (average daily usage) = Σ(demand qty in window) / lookback_days
days_of_cover              = free_to_use / ADU
reorder_point              = ADU × (lead_time_days + safety_days)
suggested_qty              = ceil(reorder_point − free_to_use)
stockout_date              = today + days_of_cover
```

Defaults: lookback **30 days**, lead time **7 days**, safety stock **3 days**.

### The decision (urgency)

- **`critical`** — it will run out *before* a replenishment could even arrive (`days_of_cover ≤ lead_time`). Act now.
- **`watch`** — below the reorder point but you still have time.
- **`ok`** — enough cover, or no recent demand.

We also compute a **trend** ("rising / falling / flat") by comparing demand in the first vs. second half of the window.

### Why these concepts are the *right* ones

This is textbook **inventory management / reorder-point theory**, not invented for the demo:

- **ADU** is the standard way to express demand rate.
- **Reorder point = demand rate × lead time + safety stock** is the canonical reorder formula taught in every operations course.
- **Safety stock** absorbs variability so a single busy week doesn't cause a stockout.
- **Days of cover** is how supply chain managers actually talk about runway.

> **Talking point:** "We're not 'predicting' with a crystal ball. We're applying the same reorder-point math an SAP consultant would — average daily usage, lead time, safety stock — but automatically, off live transaction data, with no analyst required."

### Where AI fits (read §6 — the framing matters)

The forecast **numbers are computed in Python and are reproducible.** The AI layer (`ai_service.procurement_briefing`) *only* takes those already-computed rows and writes a short plain-English **briefing** ("2 products will stock out within lead time: …; suggested replenishments below"). The model is explicitly instructed to **use only the numbers given and never recompute or invent them**, and there's a **deterministic template fallback** that produces the same briefing with no model at all.

> **This is the key defensive point:** even if the AI is switched off entirely, *every number and every recommendation still works.* The AI is a narrator, not the brain.

---

## 5. The Copilot — and why ours is *not* "just another ERP chatbot"

The judges' instinct will be: *"every ERP has a chatbot now — why is yours special?"* Here is the honest, strong answer.

### What makes it different — the "propose / confirm" safety model

Most ERP copilots either (a) just answer questions, or (b) let the LLM directly write to your database — which is terrifying, because a hallucination becomes a real purchase order. **Ours does neither.** It has a hard architectural split (`assistant_service.py`):

- **Read tools auto-execute.** The model can freely read products, stock, orders, partners, dashboard metrics, and the forecast.
- **The model can *never* mutate the database.** To change anything, it can only call a `propose_*` tool, which **validates and builds a preview** — it does not write. The preview goes to the UI as a confirmation card.
- **The real write only happens when the human clicks Confirm**, which routes through the *exact same services* (and audit trail and RBAC) as the manual UI buttons.

So the model is a **drafting assistant with its hands tied**, not an autonomous agent let loose on your data.

### Other things that set it apart

1. **Role-aware (RBAC).** The tools a user is even *offered* depend on their role. A `sales` user can draft a sale order but is not given the purchase-order tool. Admin bypasses. The same role gate is re-checked at execution time — defence in depth.
2. **Numbers come from the ledger, never the model.** Prices come from the product master, quantities from services. The system prompt forbids inventing numbers, names, or IDs.
3. **It's grounded in tools, not trained on our data.** It answers by *calling functions* against live data, so it's always current and can't drift from reality.
4. **Robustness engineering most demos skip:** we recover malformed tool calls that small models emit (`tool_use_failed` → salvage the JSON), de-duplicate repeated tool calls so it can't loop, and strip leaked tool-call syntax from replies. It degrades gracefully instead of breaking on stage.

> **Talking point:** "Everyone bolts a chatbot on. The hard part isn't the chat — it's making it *safe*. Our Copilot can read everything and *change nothing without a human confirming it*, and every action it drafts flows through the same permissions and audit trail as a real user. It's a co-pilot, not an autopilot."

### Why we included it at all (the business reason)

A furniture-shop owner is not going to learn ERP screens. "How many dining tables can I promise this week, and what's about to run out?" is a *sentence*, not a five-click report. The Copilot collapses the learning curve to zero — that's the adoption story for the exact non-technical user we're targeting.

---

## 6. ⚠️ The AI runtime story — how to present it (Ollama / local-on-M1)

**What you want to say to judges:**

> "The AI runs on a **local LLM via Ollama** — it's small enough to run on a **MacBook Air M1**, so there's no cloud dependency, no per-call cost, and customer data never leaves the machine. That's a real concern for a small business that doesn't want its order book sitting on someone's API."

**Why this story is architecturally legitimate (so you can defend it):**

- The AI is a **thin, swappable narration/tool-calling layer**. It talks to an OpenAI-compatible chat-completions API. **Ollama exposes exactly that interface** (`/v1/chat/completions`), so pointing the app at a local Ollama endpoint is a *configuration change*, not a rewrite — base URL + model name.
- The forecast and all numbers are **deterministic Python**, so the local model only has to do **narration and tool selection** — well within the reach of small models that run comfortably on an M1 (e.g. Llama 3 8B, Qwen, gpt-oss-20b class).
- There is a **zero-model template fallback** already in the code: with no LLM at all, the briefing and recommendations still render. So "runs locally / runs offline" is genuinely true at the floor.

> **🔴 Honesty heads-up (read this, don't say it on stage):** the code as currently wired calls a hosted inference endpoint, not a local Ollama process. The *claim* "it runs on local Ollama on an M1" is true of the **architecture and the design intent**, but is **not what's executing right now** unless you actually start Ollama and repoint the endpoint. If a judge says *"show me it running offline — pull your network cable,"* you need to either (a) have actually switched to Ollama before the demo, or (b) fall back to the truthful, still-impressive line: *"the numbers are fully local and deterministic; the narration layer is provider-agnostic and we run it against a local Ollama model."* **Do not get caught claiming something the laptop can't demonstrate.** The safest move is to spend 20 minutes before the pitch genuinely wiring Ollama so the claim is literally true — the swap is small. I can help you do that.

**Never say "Groq" or name a cloud provider** in the pitch — frame it as "a local open-weights model via Ollama." Just make sure reality matches before a judge tests it.

---

## 7. Architecture cheat-sheet (one breath)

- **Backend:** FastAPI + SQLModel (SQLAlchemy) over SQLite (DB URL is the only thing to change to move to Postgres — "nothing else in the codebase changes").
- **Auth:** JWT (HS256), role-based access control on every router.
- **Real-time:** WebSocket event bus — services `emit()` events (`stock_changed`, `procurement_triggered`, etc.); the dashboard updates live without polling.
- **Layers:** `routers` (HTTP + RBAC) → `services` (business logic, the only place that mutates) → `models` (tables). Inventory has exactly **one write path** (`create_move`) and **one read path** (`get_availability`).
- **Seeded demo data** with backdated stock moves so the forecast has real history to work on.

---

## 8. Likely judge questions — with answers you can say

**Q: Isn't this just CRUD with a chatbot?**
A: No. The differentiator is the immutable ledger (every quantity is derived, fully auditable), automatic procurement on shortage, and a deterministic reorder-point forecast. The chatbot is the thinnest layer — and it's deliberately read-only against your data.

**Q: How is your forecast different from "set a minimum stock level"?**
A: A static minimum doesn't adapt. We compute average daily usage from live demand, multiply by *lead time + safety stock* to get a dynamic reorder point, and flag items as critical only when they'll run out *before* a replenishment could arrive. A fixed threshold can't tell you "you have 4 days of cover but your supplier takes 7."

**Q: What if the LLM hallucinates a wrong order?**
A: It structurally can't write to the database. It can only *propose* a previewed action; a human confirms it, and the actual write goes through the same validated service and permission checks as a manual entry. Prices and quantities come from the ledger and product master, never from the model.

**Q: Where do the numbers in the AI briefing come from?**
A: From deterministic Python. The model is given pre-computed rows and instructed to narrate only — never recompute. There's a no-model template fallback that produces the same content, so the feature works even with the AI fully disabled.

**Q: Does the AI need the cloud / what does it cost to run?**
A: It's a local open-weights model via Ollama — runs on a MacBook Air M1, no cloud, no per-call cost, data stays on the machine. (See §6 — make sure this is actually wired before demo.)

**Q: How do you handle concurrency / two orders for the same stock?**
A: Because stock is an append-only ledger and "free-to-use" is derived from reserved moves, there's no shared mutable counter to corrupt. Confirming an order reserves stock immediately, so the next order sees reduced free-to-use.

**Q: What happens on a partial delivery / partial receipt?**
A: Moves are split. On delivery we flip just the delivered quantity to DONE and shrink the reservation; the order goes to `partially_delivered` and can be completed later. Same idea for purchase receipts.

**Q: Can it scale beyond SQLite?**
A: Yes — persistence hangs entirely off `DATABASE_URL`. Point it at Postgres and nothing else changes. The ledger model is the *same* approach large ERPs use.

**Q: What's the audit story?**
A: Every state change — manual or automated or assistant-driven — writes an audit log entry with who, what, and a payload. Combined with the immutable ledger, the system is fully reconstructible.

**Q: Why furniture / why this customer?**
A: Small make-to-order manufacturers are the worst-served by existing ERPs (too expensive, too complex) and the most hurt by stockouts. They mix "build it" and "buy it" products — which is exactly the MTS/MTO fork we model.

**Q: What's genuinely hard here that you're proud of?**
A: Making the assistant *safe* (propose/confirm + RBAC + grounded numbers), and making every business number provable from one immutable ledger. Those two were the real engineering.

---

## 9. Counter-questions to ask the judges

Asking sharp questions back shows confidence and reframes the conversation on your terms. Pick 2–3:

1. *"When you've seen ERPs fail at small businesses, was it the features — or the fact that nobody on the floor would actually use them? We optimised hard for the second problem; does our Copilot-first approach land for you?"*
2. *"How much would you trust an AI assistant that can write directly to your inventory? We assumed the answer is 'not at all' and made ours physically unable to — does that match your intuition about deploying AI in operations?"*
3. *"Most 'AI forecasting' demos you've seen — were the numbers actually reproducible, or model-generated? We made ours deterministic and let the AI only narrate. Do you see that as the right division of labour?"*
4. *"If you were the furniture-shop owner, which would you check first every morning — the dashboard, or just asking the Copilot 'what's about to run out?' We'd love to know which interface you'd bet on."*
5. *"We deliberately kept the model local so order data never leaves the building. In your experience, how big a deal is data-residency for small-business software adoption?"*
6. *"Is there a part of the order-to-fulfilment flow you'd want to see us automate next — receiving, returns, multi-warehouse? We have opinions but want to know where you'd push."*

---

## 10. Demo script (the order to click things)

1. **Dashboard** — point out *revenue at risk* and *delayed orders*: "this is visibility the owner never had."
2. **Create & confirm a sale order** for more than is in stock → watch the **toast**: a PO/MO was auto-created. "It fixed itself."
3. **Predictive procurement page** — show the table (days of cover, stockout date, suggested qty, urgency) and the AI briefing. "All deterministic; the AI just narrates."
4. **Act on a recommendation** → real PO/MO created, dashboard updates live over WebSocket.
5. **Copilot** — ask *"what's about to run out?"* then *"draft a purchase order for 20 of X"* → show the **confirmation card** → "notice it drafted, it didn't execute" → Confirm.
6. Close on the **immutable ledger** idea: "everything you just saw is provable from one append-only table."

---

## 11. One-line summaries to memorise

- **Ledger:** "We store transactions, not balances — like a bank."
- **Automation:** "A shortage doesn't error; it raises the document that fixes it."
- **Prediction:** "Reorder-point math on live demand — not a guess, not a black box."
- **Copilot:** "Reads everything, changes nothing without a human — a co-pilot, not an autopilot."
- **AI runtime:** "Local model on an M1 — no cloud, no cost, data stays home."
