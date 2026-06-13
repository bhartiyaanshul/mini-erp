# Mini ERP Hackathon Review

## Quick Verdict

**Current rating: 7.8/10**

This is a strong submission for the given Odoo-style brief because it already implements the main flow end to end: products, sales, purchase, manufacturing, BoM, stock ledger, MTS/MTO procurement, RBAC, audit trail, live dashboard, seeded demo, and a frontend that can present the story clearly.

The biggest disadvantage is not assignment fit. The project fits the brief well. The main risk is that judges may see it as a clean CRUD ERP with automation, not as a uniquely winning product. To win, the demo needs sharper business impact, fewer demo-day risks, richer manufacturing realism, and a stronger "why this is better than Odoo/spreadsheets" moment.

## Scorecard

| Area | Score | Notes |
|---|---:|---|
| Brief coverage | 9/10 | Nearly every required module exists and is connected. |
| Core ERP logic | 8.5/10 | Ledger-derived inventory and automated procurement are strong. |
| Demo story | 8/10 | Good MTS/MTO script, but needs more suspense and business payoff. |
| Innovation | 7/10 | Forecasting and Copilot help, but must be framed as proactive orchestration. |
| UI/UX | 7.5/10 | Clean operational dashboard; some screens may still feel form/table-heavy. |
| Technical reliability | 6.5/10 | Frontend builds; backend smoke test hit a readonly SQLite error during seed. |
| Enterprise realism | 6.5/10 | Missing due dates, approvals, component shortage handling, costing, and scheduling depth. |
| Judge memorability | 7/10 | Good foundation, but needs one killer visual workflow and measurable impact. |

## What Is Already Strong

- **Ledger-based stock**: no stored stock quantity; on-hand, reserved, and free-to-use are derived from `StockMove`.
- **Connected demand-to-delivery flow**: sales confirmation reserves stock and triggers MO/PO for shortage.
- **MTS + MTO support**: small orders use stock; large orders trigger manufacturing or purchase.
- **Manufacturing with BoM and work orders**: components, operations, work centers, and finished goods are represented.
- **RBAC**: Admin, Sales, Purchase, Manufacturing, Inventory, and Owner roles exist.
- **Audit logs and product timeline**: traceability is present and demo-friendly.
- **Realtime events**: live activity feed makes automation visible.
- **Forecast and Copilot additions**: these can differentiate the project if positioned well.

## Biggest Disadvantages

1. **The project may look too similar to a standard mini ERP.**
   The required modules are implemented, but judges may ask: "Why is this hackathon-winning, not just complete?" The answer should become: **an intelligent operations control tower that predicts shortages, explains decisions, and executes with human approval.**

2. **Backend smoke test currently fails on demo-day setup.**
   `backend/smoke_test.py` started correctly but failed at demo seeding with `sqlite3.OperationalError: attempt to write a readonly database`. Even if this is environment-specific, it is a serious risk. A judge/demo machine must be able to reset and seed reliably.

3. **Manufacturing is simplified.**
   MO completion can mark all work orders done at once. There is no strict sequence gate, no partial production, no scrap, no quality check, no bottleneck view, and no operator-level progress.

4. **Component shortage logic is incomplete.**
   MO confirmation reserves required components but does not clearly block or auto-procure missing raw materials. A winning ERP should show cascading procurement: sales shortage creates MO; MO component shortage creates PO.

5. **No delivery dates or SLA realism.**
   Dashboard has "Delayed Orders", but the model has no promised delivery date, planned start date, expected vendor receipt date, or lead-time-based delay calculation.

6. **Forecasting is useful but still basic.**
   It uses historical ledger demand and fixed settings. That is fine for a hackathon, but the UI should explain confidence, lead time, reorder point, and why the recommendation matters in rupees/days.

7. **Copilot depends on external Groq config.**
   Forecast briefing falls back gracefully, but Copilot chat returns unavailable without `GROQ_API_KEY`. If this is a headline feature, prepare a fallback scripted/local mode or do not depend on it during judging.

8. **No financial impact layer.**
   The brief is operational, but winning demos often show business value: revenue protected, stockout avoided, cash blocked in inventory, procurement cost, margin, and delay risk.

9. **No approvals/escalations.**
   Real ERPs need approvals for high-value purchase orders, urgent manufacturing, or manual stock adjustments. Adding this creates a more enterprise-grade story.

10. **Testing is mostly one smoke script.**
    The smoke script is good, but there are no focused unit tests for ledger math, procurement branching, RBAC boundaries, or forecast calculations.

## Winning Product Angle

Reposition the project from:

> "Mini ERP for demand to delivery"

to:

> **"Autopilot for small manufacturers: converts demand into stock reservations, production, purchase, and audit-ready decisions in real time."**

Your one-line pitch:

> Shiv Furniture Works no longer asks "Can we fulfill this order?" The ERP answers instantly, reserves what exists, manufactures or buys what is missing, predicts the next shortage, and leaves a full audit trail.

## Priority Upgrade Plan

### P0: Fix Demo Reliability

- Fix the readonly SQLite smoke-test issue.
- Add a `make demo-reset` or single script that:
  - removes old local DB safely,
  - starts backend,
  - seeds demo,
  - starts frontend,
  - prints demo accounts.
- Add a visible "Demo Health" endpoint or checklist:
  - users seeded,
  - products seeded,
  - BoM present,
  - stock ledger valid,
  - websocket connected.
- Keep one known-good demo path with exact quantities.

### P1: Add Cascading Procurement

Current story:

> Sale shortage creates MO/PO.

Winning story:

> Sale shortage creates MO, MO checks raw materials, raw material shortage creates PO, and the dashboard shows the full dependency chain.

Add:

- `procurement_group_id` or `origin_chain` linking SO -> MO -> PO.
- Component availability check during MO confirmation.
- Auto-PO for missing components when `procure_on_demand=true`.
- Dependency timeline:
  - SO-0004 needs 20 tables.
  - 2 reserved from stock.
  - MO-0002 created for 18 tables.
  - PO-0007 created for 40 screws shortage.
  - Delivery blocked until PO received and MO completed.

### P2: Add Promise Dates And Delay Intelligence

Add fields:

- Sale order `promise_date`.
- Purchase order `expected_receipt_date`.
- Manufacturing order `planned_start`, `planned_finish`.
- Product/vendor/manufacturing lead time.

Then upgrade dashboard:

- "At-risk orders" instead of only "Delayed Orders".
- Reason labels:
  - waiting for vendor,
  - waiting for manufacturing,
  - missing components,
  - stock reserved but not delivered.
- Calculate projected delivery date from dependency chain.

Judge-friendly line:

> "The system does not just say stock is low. It tells the owner which customer delivery will be missed and why."

### P3: Make Manufacturing Feel Real

Add:

- Work-order sequence lock: Painting cannot start before Assembly is done.
- Start/pause/complete buttons per work order.
- Partial production: produce 5 of 18 tables today.
- Scrap/rework quantity.
- Quality check before finished goods enter stock.
- Work-center load chart:
  - Assembly Line: 140 mins queued.
  - Paint Floor: 70 mins queued.
  - Packaging: 40 mins queued.

This turns manufacturing from a backend state change into a visual operational workflow.

### P4: Add Business Impact Metrics

Add dashboard cards:

- Revenue at risk from delayed orders.
- Stockout avoided by auto-procurement.
- Inventory value on hand.
- Gross margin on open sales orders.
- Procurement spend pending approval.
- Working capital locked in excess stock.

Add a final demo moment:

> "This one sales order would have caused a delay. The system protected ₹60,000 revenue by triggering production and purchase within seconds."

### P5: Improve Forecasting Into A Decision Engine

Keep deterministic ledger forecast, but show:

- Average daily usage.
- Days of cover.
- Reorder point.
- Suggested quantity.
- Lead time.
- Safety stock.
- Confidence label based on demand history volume.

Add "Why this recommendation?" drawer:

```text
Office Chair
Free stock: 10
Average demand: 2.4/day
Lead time + safety: 10 days
Reorder point: 24
Suggested buy: 14
Risk: stockout in 4.2 days
```

This makes the AI/forecast feel trustworthy instead of magical.

### P6: Add Approval Workflow

Add approval states:

- Purchase order over threshold requires Owner approval.
- Manual stock adjustment requires reason and approval.
- Emergency procurement gets highlighted.

Demo:

1. Sales order triggers large PO.
2. Purchase user cannot confirm because amount is high.
3. Owner approves from dashboard.
4. PO becomes confirmable and auditable.

This uses RBAC in a more impressive way.

### P7: Make The UI More Memorable

Add one "Demand To Delivery Map" screen:

```text
Customer Order
   -> Stock Reservation
   -> Manufacturing Order
   -> Component Consumption
   -> Purchase Order for Shortage
   -> Receipt
   -> Finished Goods
   -> Delivery
   -> Audit Trail
```

Use this as the main demo screen. Judges remember flows more than tables.

## Suggested Feature Set For A Winning Final Demo

Build toward these five hero features:

1. **Live Demand-To-Delivery Orchestration**
   Sales order automatically becomes reservations, MO/PO, stock moves, and audit records.

2. **Cascading MTO Procurement**
   Finished-good shortage triggers manufacturing; component shortage triggers purchase.

3. **At-Risk Delivery Control Tower**
   Owner sees which orders will miss promise dates, why, and what action fixes them.

4. **Predictive Procurement**
   Ledger-derived demand forecast recommends what to buy or manufacture before stockout.

5. **Human-Approved ERP Copilot**
   Assistant reads live ERP data, drafts actions, and requires confirmation before mutation.

## Technical Fixes To Prioritize

- Fix smoke-test DB path/permissions so `cd backend && .venv/bin/python smoke_test.py` passes.
- Validate quantities are positive for sales, purchase, BoM, MO, and stock moves.
- Prevent deliveries from over-delivering or completing impossible reservations.
- Block MO completion when components are not fully available/reserved.
- Avoid creating PO with `partner_id=0`; require default vendor or show configuration error.
- Add indexes/aggregation for stock ledger if data volume grows.
- Add unit tests for:
  - ledger availability,
  - sales reservation,
  - MTO manufacture,
  - MTO buy,
  - component shortage cascade,
  - forecast math,
  - RBAC.
- Add a `.env.example` with safe defaults and optional Groq settings.
- Keep AI features optional and demo-safe with deterministic fallbacks.

## Demo Script Upgrade

### Opening

"Shiv Furniture used to run on Excel, WhatsApp, and manual stock registers. The problem was not data entry; the problem was that demand, stock, purchase, and production did not talk to each other."

### Moment 1: Sell From Stock

- Sales creates order for 3 Wooden Tables.
- System reserves stock.
- Deliver.
- Show ledger: reservation turned into done movement.

### Moment 2: Demand Exceeds Stock

- Sales creates order for 20 Wooden Tables.
- System reserves available stock.
- Automatically creates MO for shortage.
- Dashboard live feed updates.

### Moment 3: Manufacturing Dependency

- Open Demand-To-Delivery Map.
- Show MO operations and component requirements.
- If upgraded, show component shortage auto-PO.

### Moment 4: Forecast Before Crisis

- Run predictive forecast.
- Show product projected to stock out.
- Click "Make" or "Buy".
- Show new MO/PO created from recommendation.

### Moment 5: Owner View

- Show at-risk orders, revenue at risk, live activity, and audit trail.
- Close with product timeline.

### Closing Line

"Every number came from the stock ledger. Every decision created a trace. And every shortage became an action automatically."

## Final Recommendation

Do not rebuild the app. The base is good. Spend the remaining time turning it from **complete ERP modules** into a **decision-making operations system**.

Best next steps:

1. Fix backend smoke/demo reset.
2. Add cascading procurement for MO component shortages.
3. Add promise dates and at-risk delivery dashboard.
4. Add one visual Demand-To-Delivery Map.
5. Add business impact metrics for the final owner view.

If these land cleanly, the project can move from **7.8/10** to roughly **9/10** for a hackathon demo.
