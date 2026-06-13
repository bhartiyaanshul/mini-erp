# Promise Engine — Available-to-Promise, Reservations & Backorder Auto-Fill

**Status:** Spec for review (no code written yet)
**Author:** design pass, 2026-06-14
**Theme:** Turn the static stock ledger into a forward-looking *promise* system — 100% deterministic, no AI.

---

## 1. Why this feature

Every ERP shows **"On hand: 50."** That number is a lie the moment you act on it. A salesperson
sees 50 and promises 50 to a customer for Friday — but 30 are already reserved against other
orders, 20 are committed as raw material to a manufacturing order, and the replenishment PO doesn't
land until Tuesday. The promise is physically impossible. Friday comes, there's no stock, the
customer's trust is gone, and someone eats an expedite fee.

The root cause is universal: **on-hand ≠ available-to-promise**, and the ERP surfaces the wrong
number at the exact moment of the promise. SMB ERPs show on-hand; the big ones bury ATP behind
consultant-configured modules. A clean, visible Available-to-Promise plus an automatic backorder
fill is a real, under-served gap — and it's pure arithmetic over data we already store.

### What already exists in this codebase (honest gap analysis)

| Capability | Status | File |
|---|---|---|
| Immutable stock ledger | ✅ exists | `models/stock.py` (`StockMove`) |
| Snapshot availability (`on_hand / reserved / free_to_use`) | ✅ exists | `services/inventory_service.py` (`get_availability`) |
| Reserve free stock on SO confirm | ✅ exists | `services/sales_service.py` (`confirm_order`) |
| Auto-create PO/MO for shortages | ✅ exists | `services/procurement_service.py` (`procure`) |
| Reservation top-up on **manual** delivery | ✅ exists | `services/sales_service.py` (`deliver_order`) |
| Component reservation/top-up for MOs | ✅ exists | `services/manufacturing_service.py` |
| Fire-and-forget event bus → WebSocket | ✅ exists | `events/bus.py` (`emit`) |
| `promise_date`, `expected_receipt_date`, `planned_finish` fields | ✅ stored, ❌ unused for logic | models |
| **Time-phased availability projection** | ❌ **missing** | — |
| **Promise-date computation / oversell check** | ❌ **missing** | — |
| **Backorder auto-allocation on supply arrival** | ❌ **missing** | — |

The Promise Engine adds the three missing rows. It **reuses** every existing primitive
(`get_availability`, `create_move`, the reservation convention, `emit`) — it does not replace them.

---

## 2. Core concepts

- **Free-to-use (now):** `on_hand − reserved`. Already computed. This is our timeline's starting balance.
- **Scheduled receipts:** future supply not yet on-hand —
  open PO lines (`qty − qty_received`) dated at `PurchaseOrder.expected_receipt_date`, and
  open MOs producing the product (`qty`) dated at `ManufacturingOrder.planned_finish`.
- **Unreserved outstanding demand (backorder):** open SO lines where
  `qty − qty_delivered − qty_reserved > 0`, dated at the order's `promise_date` (or `order_date`).
  The *reserved* portion is already netted out of `free_to_use`, so we only time-phase the
  unreserved part. This is the key trick that avoids double-counting.
- **Available-to-Promise (cumulative method):**
  `ATP(t) = free_now + Σ scheduled_receipts(≤ t) − Σ unreserved_demand(≤ t)`.
  Because it subtracts *other* open demand, it structurally **prevents promising the same incoming
  PO to two customers**.
- **Promise date for qty Q:** the earliest date `t` where `ATP(t) ≥ Q`. If `free_now ≥ Q`, the
  promise is "today." If `ATP` never reaches `Q` within the horizon → "no committed supply"
  (needs procurement).

---

## 3. Deliverables

1. **ATP timeline** — per-product projected availability over a horizon (read-only computation).
2. **Promise check + promise dates** — pre-check at order entry; compute & persist `promise_date`
   on confirm; expose an on-time / at-risk / late status.
3. **Backorder auto-allocation** — when supply arrives (PO received / MO completed), automatically
   reserve it against the highest-priority waiting SO lines and recompute their promise dates.

---

## 4. Backend design

### 4.1 New module: `app/services/promise_service.py`

Pure functions over existing models. No new external dependencies.

```python
# Signatures (illustrative)

def supply_demand_timeline(session, product_id: int, horizon_days: int = 60) -> dict:
    """Return the building blocks: free_now, list of dated supply events,
    list of dated unreserved-demand events — all for one product."""

def project_atp(session, product_id: int, horizon_days: int = 60) -> list[dict]:
    """Cumulative ATP per event date:
    [{ "date": ..., "delta": +/-qty, "source": "PO-0007"|"SO-0012"|"MO-0003",
       "running_on_hand": ..., "atp": ... }, ...]"""

def promise_for(session, product_id: int, qty: float, from_date=None) -> dict:
    """{ "qty_available_now": float,          # min(qty, free_now)
         "full_promise_date": date|None,      # earliest date ATP >= qty, else None
         "needs_procurement": bool,
         "breakdown": [ {date, qty, source}, ... ] }"""

def order_promise(session, so) -> dict:
    """Per-line promise dates for a (draft or confirmed) SO; the order-level
    promise_date is max(line promise dates). Used by confirm_order."""

def allocate_incoming(session, product_id: int) -> list[dict]:
    """THE CLOSED LOOP. After supply arrives, reserve newly-free stock against
    open SO lines that are short, in priority order. Returns allocations made."""
```

### 4.2 The timeline algorithm (grounded in current models)

```
free_now = inventory_service.get_availability(session, P)["free_to_use"]

supply_events = []
  for PO in confirmed/partially-received POs with a line for P:
      remaining = line.qty - line.qty_received
      if remaining > 0: supply_events += (PO.expected_receipt_date, +remaining, PO.name)
  for MO in confirmed/in-progress MOs producing P:
      supply_events += (MO.planned_finish, +MO.qty, MO.name)

demand_events = []
  for SO in confirmed/partially-delivered SOs with a line for P:
      unreserved = line.qty - line.qty_delivered - line.qty_reserved
      if unreserved > 0: demand_events += (SO.promise_date or SO.order_date, -unreserved, SO.name)

events = sort(supply_events + demand_events) by date
running = free_now
for e in events:
    running += e.delta
    e.atp = running          # cumulative ATP at/after this date
```

> **Note on MO component demand:** an MO's component needs are either already *reserved*
> (netted into `free_now`) or were auto-procured into a PO/MO at confirm time. So unreserved MO
> component demand is normally zero and does not need separate time-phasing. Documented so a future
> reader doesn't think it's missing.

### 4.3 Promise computation

```
promise_for(P, Q):
    if free_now >= Q:  return available_now=Q, full_promise_date=today
    timeline = project_atp(P)
    walk forward; first date where atp >= Q  ->  full_promise_date
    if none within horizon: needs_procurement=True, full_promise_date=None
```

For a **new SO line not yet confirmed**, this is correct as-is: cumulative ATP already subtracts
other open demand, so two simultaneous quotes for the last unit can't both be promised the same day.

### 4.4 Backorder auto-allocation (the magic)

```
allocate_incoming(session, P):
    free = get_availability(P).free_to_use            # just increased by the receipt
    candidates = open SO lines for P where
                 (line.qty - line.qty_delivered - line.qty_reserved) > 0
    sort candidates by (promise_date or order_date asc, so.id asc)   # earliest-promise-first
    allocations = []
    for line in candidates:
        need = line.qty - line.qty_delivered - line.qty_reserved
        take = min(free, need)
        if take <= 1e-9: break
        inventory_service.create_move(..., move_type=OUT, source=SALE,
                                       state=RESERVED, source_doc_id=so.id,
                                       qty=take, note=f"Backorder fill for {so.name}")
        line.qty_reserved += take
        free -= take
        allocations.append({so, product, qty: take})
        audit_service.log(... action="backorder_allocated" ...)
    return allocations
```

**Idempotent & safe:** it only ever reserves up to the outstanding need, so re-running it can't
over-allocate. It runs inside the receipt transaction (see 4.5), so allocation and the IN move
commit atomically.

### 4.5 Integration points (minimal, surgical edits)

- **`sales_service.confirm_order`** — after the existing reserve+procure loop, call
  `order_promise()` and set `so.promise_date`. Set a derived `promise_status`
  (on-time / at-risk / late) by comparing to `requested_date`. **Never block** — warn only, matching
  the existing non-blocking auto-procure philosophy.
- **`purchase_service.receive_order`** — after writing the done IN moves and `flush()`, before
  `commit()`, call `promise_service.allocate_incoming(session, product_id)` for each received
  product. After commit, `emit("backorder_allocated", {...})` for each allocation.
- **`manufacturing_service.complete_mo`** — same hook after the finished-goods IN move for
  `mo.product_id`.
- **`sales_service.cancel_order`** — *currently only allowed from DRAFT*, so reservations from
  confirmed orders are never released. Add a path to release reserved SALE moves
  (`reserved_moves_for` → delete/zero) so cancelled demand frees ATP. (Phase 4; flagged because it's
  a latent correctness gap the engine depends on.)

### 4.6 New endpoints (`app/routers/promise.py`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/promise/atp/{product_id}?horizon=60` | SALES/PRODUCT view | timeline + current ATP for a product |
| `POST` | `/api/promise/check` | SALES view | body `{product_id, qty, requested_date?}` → promise result (order-entry pre-check) |
| `GET` | `/api/promise/backorders` | SALES view | worklist of open SO lines short on stock, their promise dates & linked supply docs |

Register the router in `app/main.py` alongside the others.

### 4.7 Schema / serializer additions

- `schemas.py`: `PromiseCheckIn { product_id, qty, requested_date? }`,
  `PromiseOut { qty_available_now, full_promise_date, needs_procurement, breakdown[] }`.
- `serializers.py` `sale_order_out`: add `promise_date`, per-line
  `{ qty_available_now, full_promise_date }`, and order-level `promise_status`.

### 4.8 Events

New event types broadcast via the existing bus (dashboard already listens):
`backorder_allocated`, and reuse `stock_changed`. This powers the live "backorders flip to ready"
moment without polling.

---

## 5. Data model changes (intentionally minimal)

| Change | Required? | Notes |
|---|---|---|
| `SaleOrder.requested_date: datetime \| None` | recommended | customer's asked-for date; drives on-time/at-risk status. `promise_date` already exists for the computed answer. |
| `SaleOrder.priority: int = 0` | optional (Phase 4) | allocation tiebreak beyond FIFO |
| New tables | **none** | allocations are reserved `StockMove`s (already linked via `source_doc_id`) + audit log rows. No genealogy table needed for v1. |

A migration is trivial (SQLite, additive nullable columns).

---

## 6. Frontend touchpoints

- **Sales create form** (`pages/Sales.tsx`) — as a line's product+qty is chosen, debounce-call
  `POST /api/promise/check` and render inline:
  *"Available to promise: 12 today · full 50 by Jun 20 (PO-1023)."*
- **Sales list/detail** — `promise_date` badge colored by `promise_status`
  (green on-time / amber at-risk / red late).
- **Backorders view** — new page or panel (Inventory/Dashboard) from `/api/promise/backorders`:
  products with demand > supply, earliest fill date, one-click "expedite" (reuses existing
  procurement). This is the ops worklist.
- **ATP timeline drawer** — on a product (Inventory/Product page), a small table/sparkline from
  `/api/promise/atp/{id}` showing projected availability. Pure read.
- **Live updates** — subscribe to `backorder_allocated` / `stock_changed` on the existing WS hook so
  promise badges flip in real time. (The demo: receive PO-1023 → three backordered SOs go
  "delayed → ready" on screen.)

Add React Query hooks in `lib/queries.ts` and endpoints in `lib/api.ts` following existing patterns;
types in `lib/types.ts`.

---

## 7. Scalability

- ATP for a product reads only **open** docs for that product (small set) + the `free_now` snapshot.
  Cost is O(open orders for product), not O(ledger). All filter columns
  (`product_id`, `state`, `source_doc_id`) are already indexed.
- The snapshot sum can later be replaced by a periodically materialized balance + deltas if the
  ledger grows huge; the timeline layer is unaffected.
- Allocation runs in the receipt transaction and is idempotent — safe to retry. For extreme
  throughput it can move to a queue later without changing semantics.
- **Multi-warehouse-ready:** add a `location_id` to `StockMove` and the timeline becomes
  per `(product, location)` — the algorithm is unchanged.

---

## 8. Decisions to confirm (defaults chosen)

1. **Allocation priority:** earliest `promise_date`/`order_date`, tiebreak `so.id` (FIFO). *(default)*
   Alternative: partner priority field.
2. **Promise shape:** report **both** `qty_available_now` and `full_promise_date` (partial promise).
   *(default)* Alternative: single "fully available" date only.
3. **Confirm behavior:** **warn + flag at-risk, never block.** *(default, matches existing
   auto-procure philosophy)*
4. **Horizon:** 60 days default, configurable via query param / settings. *(default)*
5. **`procure_on_demand = false` products:** promise date = earliest *existing* scheduled receipt,
   else "none / manual." *(default)*

---

## 9. Phased rollout

- **Phase 1 — ATP read layer (zero-risk, fully demoable).**
  `promise_service.supply_demand_timeline` + `project_atp` + `promise_for`;
  `GET /api/promise/atp`, `POST /api/promise/check`; inline promise badge in Sales create.
  *Pure computation over existing data — touches no write path.*
- **Phase 2 — Promise dates persisted.**
  Compute & store `promise_date` + `promise_status` on confirm; serializer exposes them;
  colored badges across Sales.
- **Phase 3 — Backorder auto-fill (the magic).**
  `allocate_incoming` wired into `receive_order` + `complete_mo`; `backorder_allocated` event;
  Backorders worklist; live badge flips.
- **Phase 4 — Hardening.**
  Release reservations on SO cancel; priority ordering; multi-location readiness;
  reservation-expiry housekeeping.

---

## 10. Test plan

- **Unit (deterministic fixtures):** timeline math (supply/demand netting, no double-count of
  reserved); `promise_for` edge cases (exactly enough, never enough, available now);
  allocation ordering & idempotency.
- **Integration:**
  1. SO short on stock → `promise_date` == linked PO ETA.
  2. Receive that PO → backorder auto-allocated, SO promise flips to "ready",
     `backorder_allocated` emitted.
  3. Two SOs competing for one incoming PO → earlier-promise SO wins; second stays short.
- Extend `backend/smoke_test.py` with a promise-engine happy path.

---

## 11. Out of scope (deliberately)

- AI/ML forecasting of demand — that's the existing `forecast_service`; the Promise Engine is the
  deterministic counterpart and complements it (forecast says *what to reorder*; promise says
  *what you can commit today*).
- Multi-warehouse transfers, lot/batch genealogy, capacity-constrained scheduling (future verticals).
