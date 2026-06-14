"""Inventory Time Machine — as-of stock & valuation, replayed from the ledger.

Every quantity here is reconstructed from the immutable `StockMove` ledger, so
the past is computed, never stored. We report PHYSICAL on-hand and its valuation
only: those derive exactly from `done` moves (each carries an immutable
`done_at`). Reserved/free are live-only state and are intentionally not rewound
(see docs/inventory-time-machine-spec.md §2).

Valuation uses current standard cost (`product.cost_price`) applied to the
historical quantity — deterministic and recognized. FIFO/moving-average would
require per-move cost capture (future work).
"""

from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app.models import AuditLog, Product, StockMove
from app.models.enums import MoveState, MoveType


def _to_naive_utc(dt: datetime) -> datetime:
    """Compare everything in naive UTC, matching how `done_at` is stored."""
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _floor(dt: datetime, bucket: str) -> datetime:
    if bucket == "hour":
        return datetime(dt.year, dt.month, dt.day, dt.hour)
    return datetime(dt.year, dt.month, dt.day)


def _step(bucket: str) -> timedelta:
    return timedelta(hours=1) if bucket == "hour" else timedelta(days=1)


# (entity_type, action) -> how the timelapse should narrate it. Anything not
# mapped (user/access/forecast/price/"updated") is treated as background noise
# and dropped from the activity stream.
_ACTIVITY_MAP: dict[tuple[str, str], dict] = {
    ("sale_order", "created"): {"kind": "placed", "label": "Order placed"},
    ("sale_order", "confirmed"): {"kind": "confirmed", "label": "Order confirmed"},
    ("sale_order", "delivered"): {"kind": "delivered", "label": "Order delivered"},
    ("sale_order", "cancelled"): {"kind": "cancelled", "label": "Order cancelled"},
    ("purchase_order", "created"): {"kind": "purchase", "label": "Purchase order raised"},
    ("purchase_order", "confirmed"): {"kind": "purchase", "label": "Purchase order confirmed"},
    ("purchase_order", "received"): {"kind": "received", "label": "Goods received"},
    ("manufacturing_order", "created"): {"kind": "manufacture", "label": "Manufacturing order created"},
    ("manufacturing_order", "confirmed"): {"kind": "manufacture", "label": "Manufacturing order confirmed"},
    ("manufacturing_order", "completed"): {"kind": "produced", "label": "Production completed"},
    ("procurement", "auto_buy"): {"kind": "auto", "label": "Auto-procurement → buy"},
    ("procurement", "auto_manufacture"): {"kind": "auto", "label": "Auto-procurement → make"},
    ("procurement", "blocked_buy"): {"kind": "blocked", "label": "Procurement blocked"},
    ("product", "stock_adjusted"): {"kind": "adjusted", "label": "Stock adjusted"},
}


def _cost_map(session: Session, company_id: int) -> dict[int, float]:
    products = session.exec(select(Product).where(Product.company_id == company_id)).all()
    return {p.id: (p.cost_price or 0.0) for p in products}


def _done_moves(session: Session, company_id: int, *, until: datetime | None = None, product_id: int | None = None):
    q = select(StockMove).where(
        StockMove.company_id == company_id,
        StockMove.state == MoveState.DONE,
        StockMove.done_at.is_not(None),
    )
    if product_id is not None:
        q = q.where(StockMove.product_id == product_id)
    if until is not None:
        q = q.where(StockMove.done_at <= until)
    return session.exec(q.order_by(StockMove.done_at)).all()


def ledger_range(session: Session, company_id: int) -> dict:
    """Earliest physical event and now — used to bound the slider."""
    first = session.exec(
        select(StockMove.done_at)
        .where(
            StockMove.company_id == company_id,
            StockMove.state == MoveState.DONE,
            StockMove.done_at.is_not(None),
        )
        .order_by(StockMove.done_at)
        .limit(1)
    ).first()
    now = datetime.utcnow()
    earliest = first or (now - timedelta(days=90))
    return {"earliest": earliest.isoformat(), "latest": now.isoformat()}


def as_of_snapshot(session: Session, company_id: int, at: datetime, *, hide_empty: bool = True) -> dict:
    """Per-product on-hand + value at instant `at`, plus company totals."""
    at = _to_naive_utc(at)
    moves = _done_moves(session, company_id, until=at)
    on_hand: dict[int, float] = {}
    for m in moves:
        sign = 1.0 if m.move_type == MoveType.IN else -1.0
        on_hand[m.product_id] = on_hand.get(m.product_id, 0.0) + sign * m.qty

    products = session.exec(select(Product).where(Product.company_id == company_id)).all()
    rows = []
    total_value = 0.0
    total_units = 0.0
    sku_count = 0
    for p in products:
        qty = round(on_hand.get(p.id, 0.0), 4)
        if hide_empty and abs(qty) < 1e-9:
            continue
        unit_cost = p.cost_price or 0.0
        value = round(qty * unit_cost, 2)
        rows.append(
            {
                "product_id": p.id,
                "name": p.name,
                "sku": p.sku,
                "uom": p.uom,
                "on_hand": qty,
                "unit_cost": unit_cost,
                "value": value,
            }
        )
        total_value += value
        total_units += qty
        if abs(qty) > 1e-9:
            sku_count += 1
    rows.sort(key=lambda r: r["value"], reverse=True)
    return {
        "at": at.isoformat(),
        "total_value": round(total_value, 2),
        "total_units": round(total_units, 4),
        "sku_count": sku_count,
        "rows": rows,
    }


def value_series(
    session: Session,
    company_id: int,
    *,
    start: datetime,
    end: datetime,
    bucket: str = "day",
    product_id: int | None = None,
) -> dict:
    """Carry-forward series of total valuation (and on-hand if product-scoped).

    A single prefix-sum pass: each done move contributes ±qty (and ±qty*cost) at
    its `done_at`; we sample the running total at each bucket boundary. History
    before `start` is folded into the first bucket, so the curve starts correct.
    Each point carries `t` (ISO bucket start) so the frontend can sync a playhead.
    """
    start = _to_naive_utc(start)
    end = _to_naive_utc(end)
    costs = _cost_map(session, company_id)
    moves = _done_moves(session, company_id, until=end, product_id=product_id)

    step = _step(bucket)
    points = []
    cur = _floor(start, bucket)
    end_floor = _floor(end, bucket)
    i = 0
    running_val = 0.0
    running_units = 0.0
    n = len(moves)
    guard = 0  # backstop against an absurd range
    while cur <= end_floor and guard < 5000:
        nxt = cur + step
        while i < n and moves[i].done_at < nxt:
            m = moves[i]
            sign = 1.0 if m.move_type == MoveType.IN else -1.0
            running_units += sign * m.qty
            running_val += sign * m.qty * costs.get(m.product_id, 0.0)
            i += 1
        pt = {"t": cur.isoformat(), "value": round(running_val, 2)}
        if product_id is not None:
            pt["on_hand"] = round(running_units, 4)
        points.append(pt)
        cur = nxt
        guard += 1

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "bucket": bucket,
        "points": points,
    }


def activity_feed(session: Session, company_id: int, start: datetime, end: datetime) -> dict:
    """Chronological operational events in [start, end] for the timelapse.

    Sourced from the audit log (already human-readable and timestamped), filtered
    to inventory/order lifecycle events and mapped to a `kind` the UI colors/icons.
    """
    start = _to_naive_utc(start)
    end = _to_naive_utc(end)
    rows = session.exec(
        select(AuditLog)
        .where(
            AuditLog.company_id == company_id,
            AuditLog.created_at >= start,
            AuditLog.created_at <= end,
        )
        .order_by(AuditLog.created_at)
    ).all()
    events = []
    for a in rows:
        meta = _ACTIVITY_MAP.get((a.entity_type, a.action))
        if not meta:
            continue
        events.append(
            {
                "ts": a.created_at.isoformat(),
                "kind": meta["kind"],
                "label": meta["label"],
                "detail": a.description,
            }
        )
    return {"start": start.isoformat(), "end": end.isoformat(), "events": events}
