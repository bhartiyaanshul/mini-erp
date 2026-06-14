from collections import defaultdict
from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.models import ManufacturingOrder, Product, PurchaseOrder, SaleOrder, SaleOrderLine, StockMove
from app.models.enums import MOState, MoveSource, MoveState, MoveType, PurchaseOrderState, SaleOrderState
from app.services import inventory_service

# Trailing window for the trend chart and product-wise sales breakdown.
TREND_DAYS = 30
# How many products to surface in the "top products by sales" ranking.
TOP_PRODUCTS = 6


def get_metrics(session: Session, company_id: int) -> dict:
    sos = list(session.exec(select(SaleOrder).where(SaleOrder.company_id == company_id)).all())
    pos = list(session.exec(select(PurchaseOrder).where(PurchaseOrder.company_id == company_id)).all())
    mos = list(
        session.exec(select(ManufacturingOrder).where(ManufacturingOrder.company_id == company_id)).all()
    )

    pending_deliveries = sum(
        1 for so in sos if so.state in (SaleOrderState.CONFIRMED, SaleOrderState.PARTIALLY_DELIVERED)
    )

    # "Delayed" = a confirmed order still waiting on stock it couldn't reserve
    # (i.e. blocked behind procurement): the visibility owners never had.
    delayed = 0
    at_risk_orders = []
    revenue_at_risk = 0.0
    for so in sos:
        if so.state in (SaleOrderState.CONFIRMED, SaleOrderState.PARTIALLY_DELIVERED):
            lines = session.exec(
                select(SaleOrderLine).where(SaleOrderLine.sale_order_id == so.id)
            ).all()
            missing_lines = [line for line in lines if line.qty_reserved + 1e-9 < line.qty]
            if missing_lines:
                delayed += 1
                missing_qty = sum(round(line.qty - line.qty_reserved, 4) for line in missing_lines)
                blocked_value = sum(round((line.qty - line.qty_reserved) * line.unit_price, 2) for line in missing_lines)
                revenue_at_risk += blocked_value
                related_mos = [
                    mo for mo in mos
                    if mo.origin == so.name and mo.state in (MOState.CONFIRMED, MOState.IN_PROGRESS)
                ]
                related_pos = [
                    po for po in pos
                    if so.name in po.origin and po.state in (PurchaseOrderState.CONFIRMED, PurchaseOrderState.PARTIALLY_RECEIVED)
                ]
                if related_pos:
                    reason = "Waiting for vendor receipt"
                    action = f"Receive {related_pos[0].name}"
                elif related_mos:
                    reason = "Waiting for manufacturing"
                    action = f"Complete {related_mos[0].name}"
                else:
                    reason = "Waiting for replenishment"
                    action = "Trigger procurement"
                at_risk_orders.append(
                    {
                        "id": so.id,
                        "name": so.name,
                        "customer": _partner_name(session, so.partner_id),
                        "missing_qty": round(missing_qty, 4),
                        "revenue": round(blocked_value, 2),
                        "reason": reason,
                        "next_action": action,
                        "promise_date": so.promise_date.isoformat() if so.promise_date else None,
                    }
                )

    def count_state(items, *states):
        return sum(1 for it in items if it.state in states)

    stock_value = _stock_value(session, company_id)
    orchestration = _orchestration(session, sos, mos, pos)
    analytics = _sales_purchase_analytics(session, company_id)
    return {
        **analytics,
        "total_sales_orders": len(sos),
        "pending_deliveries": pending_deliveries,
        "manufacturing_orders": len(mos),
        "mo_open": count_state(mos, MOState.CONFIRMED, MOState.IN_PROGRESS),
        "mo_done": count_state(mos, MOState.DONE),
        "delayed_orders": delayed,
        "total_purchase_orders": len(pos),
        "partial_receipts": count_state(pos, PurchaseOrderState.PARTIALLY_RECEIVED),
        "po_open": count_state(pos, PurchaseOrderState.CONFIRMED, PurchaseOrderState.PARTIALLY_RECEIVED),
        "at_risk_orders": sorted(at_risk_orders, key=lambda x: x["revenue"], reverse=True)[:5],
        "revenue_at_risk": round(revenue_at_risk, 2),
        "inventory_value": round(stock_value, 2),
        "open_procurement_value": round(_open_procurement_value(pos), 2),
        "orchestration": orchestration,
        "sales_by_state": _by_state(sos, SaleOrderState),
        "mo_by_state": _by_state(mos, MOState),
        "po_by_state": _by_state(pos, PurchaseOrderState),
    }


def _sales_purchase_analytics(session: Session, company_id: int) -> dict:
    """Money flow, straight from the ledger — the same source of truth as stock.

    Sales revenue  = Σ(done SALE out-moves × sales_price)
    Purchase spend = Σ(done PURCHASE in-moves × cost_price)

    The headline totals are all-time; the per-product breakdown and the daily
    trend series are scoped to the trailing ``TREND_DAYS`` window so the charts
    reflect recent activity. Prices live on the product (moves carry only qty),
    which is exact here since prices are static — consistent with how the
    forecast already reasons over the ledger.
    """
    products = {
        p.id: p for p in session.exec(select(Product).where(Product.company_id == company_id)).all()
    }
    moves = session.exec(
        select(StockMove).where(
            StockMove.company_id == company_id,
            StockMove.state == MoveState.DONE,
            StockMove.source.in_((MoveSource.SALE, MoveSource.PURCHASE)),
        )
    ).all()

    window_start = datetime.utcnow() - timedelta(days=TREND_DAYS)
    total_sales = 0.0
    total_purchase = 0.0
    product_value: dict[int, float] = defaultdict(float)
    product_qty: dict[int, float] = defaultdict(float)

    # Pre-seed each day in the window so the trend line is continuous (no gaps).
    daily: dict[str, dict[str, float]] = {
        (window_start + timedelta(days=i)).date().isoformat(): {"sales": 0.0, "purchases": 0.0}
        for i in range(TREND_DAYS + 1)
    }

    for m in moves:
        product = products.get(m.product_id)
        if not product:
            continue
        ts = m.done_at or m.created_at
        in_window = bool(ts and ts >= window_start)
        day_key = ts.date().isoformat() if ts else None

        if m.source == MoveSource.SALE and m.move_type == MoveType.OUT:
            value = m.qty * product.sales_price
            total_sales += value
            if in_window:
                product_value[m.product_id] += value
                product_qty[m.product_id] += m.qty
                if day_key in daily:
                    daily[day_key]["sales"] += value
        elif m.source == MoveSource.PURCHASE and m.move_type == MoveType.IN:
            value = m.qty * product.cost_price
            total_purchase += value
            if in_window and day_key in daily:
                daily[day_key]["purchases"] += value

    sales_by_product = sorted(
        (
            {
                "product_id": pid,
                "name": products[pid].name,
                "sku": products[pid].sku,
                "qty": round(product_qty[pid], 2),
                "value": round(value, 2),
            }
            for pid, value in product_value.items()
        ),
        key=lambda r: r["value"],
        reverse=True,
    )[:TOP_PRODUCTS]

    trend = [
        {"date": day, "sales": round(v["sales"], 2), "purchases": round(v["purchases"], 2)}
        for day, v in sorted(daily.items())
    ]

    return {
        "total_sales_value": round(total_sales, 2),
        "total_purchase_value": round(total_purchase, 2),
        "sales_by_product": sales_by_product,
        "sales_purchase_trend": trend,
    }


def _partner_name(session: Session, partner_id: int) -> str:
    from app.models import Partner

    partner = session.get(Partner, partner_id)
    return partner.name if partner else f"Partner #{partner_id}"


def _stock_value(session: Session, company_id: int) -> float:
    products = list(session.exec(select(Product).where(Product.company_id == company_id)).all())
    amap = inventory_service.availability_map(session, [p.id for p in products])
    return sum(max(0.0, amap[p.id]["on_hand"]) * p.cost_price for p in products)


def _open_procurement_value(pos: list[PurchaseOrder]) -> float:
    total = 0.0
    for po in pos:
        if po.state in (PurchaseOrderState.CONFIRMED, PurchaseOrderState.PARTIALLY_RECEIVED):
            for line in po.lines:
                total += max(0.0, line.qty - line.qty_received) * line.unit_price
    return total


def _orchestration(
    session: Session,
    sos: list[SaleOrder],
    mos: list[ManufacturingOrder],
    pos: list[PurchaseOrder],
) -> list[dict]:
    open_states = (SaleOrderState.CONFIRMED, SaleOrderState.PARTIALLY_DELIVERED)
    rows = []
    for so in sorted([x for x in sos if x.state in open_states], key=lambda x: x.id or 0, reverse=True)[:4]:
        so_lines = session.exec(select(SaleOrderLine).where(SaleOrderLine.sale_order_id == so.id)).all()
        reserved = sum(line.qty_reserved for line in so_lines)
        ordered = sum(line.qty for line in so_lines)
        linked_mos = [mo for mo in mos if mo.origin == so.name]
        linked_pos = [po for po in pos if so.name in po.origin]
        nodes = [
            {"label": so.name, "kind": "SO", "state": so.state.value, "detail": f"{reserved:g}/{ordered:g} reserved"},
        ]
        for mo in linked_mos[:2]:
            nodes.append({"label": mo.name, "kind": "MO", "state": mo.state.value, "detail": mo.product_id})
        for po in linked_pos[:2]:
            nodes.append({"label": po.name, "kind": "PO", "state": po.state.value, "detail": po.origin})
        if so.state == SaleOrderState.FULLY_DELIVERED:
            nodes.append({"label": "Delivered", "kind": "OUT", "state": "done", "detail": "Customer shipped"})
        rows.append(
            {
                "order": so.name,
                "customer": _partner_name(session, so.partner_id),
                "value": round(sum(line.qty * line.unit_price for line in so_lines), 2),
                "nodes": nodes,
            }
        )
    return rows


def _by_state(items, enum_cls) -> list[dict]:
    counts = {s.value: 0 for s in enum_cls}
    for it in items:
        counts[it.state.value] = counts.get(it.state.value, 0) + 1
    return [{"state": k, "count": v} for k, v in counts.items()]


def low_stock(session: Session, company_id: int, threshold: float = 10.0) -> list[dict]:
    """Stretch: products whose free-to-use is trending toward zero."""
    products = list(session.exec(select(Product).where(Product.company_id == company_id)).all())
    amap = inventory_service.availability_map(session, [p.id for p in products])
    out = []
    for p in products:
        avail = amap.get(p.id, {})
        if avail.get("free_to_use", 0.0) <= threshold:
            out.append(
                {
                    "id": p.id,
                    "name": p.name,
                    "free_to_use": avail.get("free_to_use", 0.0),
                    "on_hand": avail.get("on_hand", 0.0),
                }
            )
    out.sort(key=lambda x: x["free_to_use"])
    return out
