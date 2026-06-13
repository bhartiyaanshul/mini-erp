from datetime import datetime, timedelta

from sqlmodel import Session

from app.events.bus import emit
from app.models import Product, PurchaseOrder, PurchaseOrderLine
from app.models.enums import MoveSource, MoveState, MoveType, PurchaseOrderState
from app.services import audit_service, inventory_service
from app.services.common import next_seq_name


def create_po(
    session: Session,
    *,
    vendor_id: int | None,
    line_items: list[dict],
    origin: str = "",
    user=None,
    auto_confirm: bool = False,
    commit: bool = True,
) -> PurchaseOrder:
    po = PurchaseOrder(
        name=next_seq_name(session, PurchaseOrder, "PO"),
        partner_id=vendor_id or 0,
        origin=origin,
        expected_receipt_date=datetime.utcnow() + timedelta(days=7),
        created_by_id=user.id if user else None,
        state=PurchaseOrderState.DRAFT,
    )
    session.add(po)
    session.flush()
    for it in line_items:
        product = session.get(Product, it["product_id"])
        unit_price = it.get("unit_price")
        if unit_price is None:
            unit_price = product.cost_price if product else 0.0
        session.add(
            PurchaseOrderLine(
                purchase_order_id=po.id,
                product_id=it["product_id"],
                qty=it["qty"],
                unit_price=unit_price,
            )
        )
    session.flush()
    audit_service.log(
        session,
        entity_type="purchase_order",
        entity_id=po.id,
        action="created",
        description=f"{po.name} created" + (f" (origin {origin})" if origin else ""),
        user_id=user.id if user else None,
        payload={"origin": origin, "lines": line_items},
    )
    if auto_confirm:
        po.state = PurchaseOrderState.CONFIRMED
        session.add(po)
        session.flush()
    if commit:
        session.commit()
        emit("purchase_order_created", {"id": po.id, "name": po.name}, message=f"{po.name} created")
    return po


def confirm_po(session: Session, po: PurchaseOrder, *, user=None) -> PurchaseOrder:
    if po.state != PurchaseOrderState.DRAFT:
        raise ValueError(f"PO {po.name} cannot be confirmed from state '{po.state.value}'")
    po.state = PurchaseOrderState.CONFIRMED
    session.add(po)
    audit_service.log(
        session,
        entity_type="purchase_order",
        entity_id=po.id,
        action="confirmed",
        description=f"{po.name} confirmed",
        user_id=user.id if user else None,
    )
    session.commit()
    session.refresh(po)
    emit("purchase_order_confirmed", {"id": po.id, "name": po.name})
    return po


def receive_order(
    session: Session,
    po: PurchaseOrder,
    *,
    user=None,
    receive_lines: dict[int, float] | None = None,
) -> dict:
    """Receive goods → write done IN moves, increasing on-hand via the ledger."""
    if po.state in (PurchaseOrderState.FULLY_RECEIVED, PurchaseOrderState.CANCELLED):
        raise ValueError(f"PO {po.name} cannot be received from state '{po.state.value}'")

    received: list[dict] = []
    fully = True
    for line in po.lines:
        remaining = line.qty - line.qty_received
        if receive_lines is None:
            qty = remaining
        else:
            qty = min(remaining, receive_lines.get(line.id, 0.0))
        if qty > 0:
            inventory_service.create_move(
                session,
                product_id=line.product_id,
                qty=qty,
                move_type=MoveType.IN,
                source=MoveSource.PURCHASE,
                state=MoveState.DONE,
                source_doc_id=po.id,
                note=f"Received via {po.name}",
            )
            line.qty_received += qty
            session.add(line)
            received.append({"product_id": line.product_id, "qty": qty})
        if line.qty_received + 1e-9 < line.qty:
            fully = False

    po.state = PurchaseOrderState.FULLY_RECEIVED if fully else PurchaseOrderState.PARTIALLY_RECEIVED
    session.add(po)
    session.flush()
    audit_service.log(
        session,
        entity_type="purchase_order",
        entity_id=po.id,
        action="received",
        description=f"{po.name} {'fully' if fully else 'partially'} received",
        user_id=user.id if user else None,
        payload={"received": received},
    )
    session.commit()
    session.refresh(po)
    emit("purchase_order_received", {"id": po.id, "name": po.name, "state": po.state.value},
         message=f"{po.name} {'fully' if fully else 'partially'} received")
    emit("stock_changed", {})
    return {"po": po, "received": received, "fully": fully}
