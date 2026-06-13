from sqlmodel import Session, select

from app.models import ManufacturingOrder, Product, PurchaseOrder, SaleOrder, SaleOrderLine
from app.models.enums import MOState, PurchaseOrderState, SaleOrderState
from app.services import inventory_service


def get_metrics(session: Session) -> dict:
    sos = list(session.exec(select(SaleOrder)).all())
    pos = list(session.exec(select(PurchaseOrder)).all())
    mos = list(session.exec(select(ManufacturingOrder)).all())

    pending_deliveries = sum(
        1 for so in sos if so.state in (SaleOrderState.CONFIRMED, SaleOrderState.PARTIALLY_DELIVERED)
    )

    # "Delayed" = a confirmed order still waiting on stock it couldn't reserve
    # (i.e. blocked behind procurement) — the visibility owners never had.
    delayed = 0
    for so in sos:
        if so.state in (SaleOrderState.CONFIRMED, SaleOrderState.PARTIALLY_DELIVERED):
            lines = session.exec(
                select(SaleOrderLine).where(SaleOrderLine.sale_order_id == so.id)
            ).all()
            if any(line.qty_reserved + 1e-9 < line.qty for line in lines):
                delayed += 1

    def count_state(items, *states):
        return sum(1 for it in items if it.state in states)

    return {
        "total_sales_orders": len(sos),
        "pending_deliveries": pending_deliveries,
        "manufacturing_orders": len(mos),
        "mo_open": count_state(mos, MOState.CONFIRMED, MOState.IN_PROGRESS),
        "mo_done": count_state(mos, MOState.DONE),
        "delayed_orders": delayed,
        "total_purchase_orders": len(pos),
        "partial_receipts": count_state(pos, PurchaseOrderState.PARTIALLY_RECEIVED),
        "po_open": count_state(pos, PurchaseOrderState.CONFIRMED, PurchaseOrderState.PARTIALLY_RECEIVED),
        "sales_by_state": _by_state(sos, SaleOrderState),
        "mo_by_state": _by_state(mos, MOState),
        "po_by_state": _by_state(pos, PurchaseOrderState),
    }


def _by_state(items, enum_cls) -> list[dict]:
    counts = {s.value: 0 for s in enum_cls}
    for it in items:
        counts[it.state.value] = counts.get(it.state.value, 0) + 1
    return [{"state": k, "count": v} for k, v in counts.items()]


def low_stock(session: Session, threshold: float = 10.0) -> list[dict]:
    """Stretch: products whose free-to-use is trending toward zero."""
    products = list(session.exec(select(Product)).all())
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
