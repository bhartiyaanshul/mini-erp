"""Predictive procurement: ledger-derived demand forecasting.

Demand is derived from the ledger, just like stock balances: we read DONE OUT
moves (sales + manufacturing consumption) over a lookback window, turn them into
an average daily usage (ADU), and project when free-to-use stock runs out. Every
number here is deterministic and reproducible; the AI layer only narrates them.
"""

import math
from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.core.config import settings
from app.models import Product, StockMove
from app.models.enums import MoveSource, MoveState, MoveType
from app.services import inventory_service

# Moves that represent real demand on a product's free stock.
_DEMAND_SOURCES = (MoveSource.SALE, MoveSource.MANUFACTURING_CONSUME)


def _demand_moves(session: Session, product_ids: list[int], since: datetime) -> dict[int, list[StockMove]]:
    """DONE OUT demand moves per product within the lookback window."""
    result: dict[int, list[StockMove]] = {pid: [] for pid in product_ids}
    if not product_ids:
        return result
    moves = session.exec(
        select(StockMove).where(
            StockMove.product_id.in_(product_ids),
            StockMove.move_type == MoveType.OUT,
            StockMove.state == MoveState.DONE,
            StockMove.source.in_(_DEMAND_SOURCES),
        )
    ).all()
    for m in moves:
        ts = m.done_at or m.created_at
        if ts and ts >= since:
            result.setdefault(m.product_id, []).append(m)
    return result


def _trend(moves: list[StockMove], since: datetime, lookback_days: int) -> str:
    """Compare demand in the first vs second half of the window."""
    mid = since + timedelta(days=lookback_days / 2.0)
    first = sum(m.qty for m in moves if (m.done_at or m.created_at) < mid)
    second = sum(m.qty for m in moves if (m.done_at or m.created_at) >= mid)
    if second > first * 1.15:
        return "rising"
    if second < first * 0.85:
        return "falling"
    return "flat"


def compute_forecast(
    product: Product,
    avail: dict,
    moves: list[StockMove],
    since: datetime,
    *,
    lookback_days: int,
    lead_time_days: int,
    safety_days: int,
) -> dict:
    """One product's forecast from its availability + demand history.

        adu          = Σ(demand qty in window) / lookback_days
        days_of_cover = free_to_use / adu
        reorder_point = adu × (lead_time + safety)        ← the safe-cover target
        suggested_qty = ceil(reorder_point − free_to_use) ← top-up to that target
    """
    free = avail.get("free_to_use", 0.0)
    total_demand = sum(m.qty for m in moves)
    adu = round(total_demand / lookback_days, 3) if lookback_days else 0.0

    reorder_point = round(adu * (lead_time_days + safety_days), 2)

    if adu > 1e-9:
        days_of_cover = round(free / adu, 1)
        stockout_date = (datetime.utcnow() + timedelta(days=max(0.0, days_of_cover))).date().isoformat()
        suggested_qty = max(0, math.ceil(reorder_point - free))
    else:
        days_of_cover = None
        stockout_date = None
        suggested_qty = 0

    # Urgency: critical if it runs out before replenishment can land.
    if adu <= 1e-9 or free > reorder_point:
        urgency = "ok"
    elif days_of_cover is not None and days_of_cover <= lead_time_days:
        urgency = "critical"
    else:
        urgency = "watch"

    strategy = product.procurement_type.value  # "buy" | "manufacture"

    return {
        "product_id": product.id,
        "name": product.name,
        "sku": product.sku,
        "uom": product.uom,
        "on_hand": avail.get("on_hand", 0.0),
        "reserved": avail.get("reserved", 0.0),
        "free_to_use": free,
        "adu": adu,
        "days_of_cover": days_of_cover,
        "stockout_date": stockout_date,
        "reorder_point": reorder_point,
        "suggested_qty": suggested_qty,
        "trend": _trend(moves, since, lookback_days),
        "strategy": strategy,
        "urgency": urgency,
    }


_URGENCY_RANK = {"critical": 0, "watch": 1, "ok": 2}


def forecast_all(session: Session, company_id: int) -> list[dict]:
    """Forecast every demand-driven product, most urgent first."""
    products = list(
        session.exec(
            select(Product).where(
                Product.company_id == company_id,
                Product.procure_on_demand == True,  # noqa: E712
            )
        ).all()
    )
    if not products:
        return []

    lookback = settings.FORECAST_LOOKBACK_DAYS
    since = datetime.utcnow() - timedelta(days=lookback)
    ids = [p.id for p in products]
    amap = inventory_service.availability_map(session, ids)
    dmoves = _demand_moves(session, ids, since)

    rows = [
        compute_forecast(
            p,
            amap.get(p.id, {}),
            dmoves.get(p.id, []),
            since,
            lookback_days=lookback,
            lead_time_days=settings.FORECAST_LEAD_TIME_DAYS,
            safety_days=settings.FORECAST_SAFETY_DAYS,
        )
        for p in products
    ]
    rows.sort(key=lambda r: (_URGENCY_RANK.get(r["urgency"], 3), r["days_of_cover"] if r["days_of_cover"] is not None else 1e9))
    return rows
