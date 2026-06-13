from sqlmodel import Session

from app.events.bus import emit
from app.models import Product, SaleOrder
from app.models.enums import MoveSource, MoveState, MoveType, SaleOrderState
from app.services import audit_service, inventory_service, procurement_service
from app.services.common import fmt_qty


def confirm_order(session: Session, so: SaleOrder, *, user=None) -> dict:
    """Reserve what's free, hand every shortage to the procurement engine.

    This is the MTS/MTO fork: an in-stock line reserves and ships from
    inventory; a short line (with procure_on_demand) fires automation.
    A mixed line does both: reserve 5, procure 15.
    """
    if so.state != SaleOrderState.DRAFT:
        raise ValueError(f"Sale order {so.name} cannot be confirmed from state '{so.state.value}'")

    procurements: list[dict] = []
    for line in so.lines:
        avail = inventory_service.get_availability(session, line.product_id)
        to_reserve = max(0.0, min(avail["free_to_use"], line.qty))
        shortage = round(line.qty - to_reserve, 4)

        if to_reserve > 0:
            inventory_service.create_move(
                session,
                company_id=so.company_id,
                product_id=line.product_id,
                qty=to_reserve,
                move_type=MoveType.OUT,
                source=MoveSource.SALE,
                state=MoveState.RESERVED,
                source_doc_id=so.id,
                note=f"Reserved for {so.name}",
            )
            line.qty_reserved = to_reserve
            session.add(line)

        if shortage > 0:
            product = session.get(Product, line.product_id)
            if product and product.procure_on_demand:
                res = procurement_service.procure(
                    session,
                    company_id=so.company_id,
                    product_id=line.product_id,
                    qty=shortage,
                    origin=so.name,
                    user=user,
                )
                res["line_id"] = line.id
                procurements.append(res)
            else:
                pname = product.name if product else f"product #{line.product_id}"
                procurements.append(
                    {
                        "kind": "none",
                        "qty": shortage,
                        "product": pname,
                        "message": f"Shortage of {fmt_qty(shortage)} {pname} — no auto-procurement configured",
                        "line_id": line.id,
                    }
                )

    so.state = SaleOrderState.CONFIRMED
    session.add(so)
    audit_service.log(
        session,
        company_id=so.company_id,
        entity_type="sale_order",
        entity_id=so.id,
        action="confirmed",
        description=f"{so.name} confirmed",
        user_id=user.id if user else None,
        payload={"procurements": [p["message"] for p in procurements]},
    )
    session.commit()

    emit("sale_order_confirmed", {"id": so.id, "name": so.name}, message=f"{so.name} confirmed")
    for p in procurements:
        if p["kind"] in ("manufacture", "buy"):
            emit(
                "procurement_triggered",
                {
                    "kind": p["kind"],
                    "doc_name": p["doc_name"],
                    "doc_id": p["doc_id"],
                    "qty": p["qty"],
                    "product": p["product"],
                    "so": so.name,
                },
                message=p["message"],
            )
    emit("stock_changed", {})
    return {"order": so, "procurements": procurements}


def deliver_order(session: Session, so: SaleOrder, *, user=None) -> dict:
    """Ship reserved stock. Tops up reservations from any newly-free stock
    first (so a procured order can be delivered once replenished), then flips
    reserved OUT moves to done OUT, splitting a move if needed for partials.
    """
    if so.state not in (SaleOrderState.CONFIRMED, SaleOrderState.PARTIALLY_DELIVERED):
        raise ValueError(f"Sale order {so.name} cannot be delivered from state '{so.state.value}'")

    delivered: list[dict] = []
    fully = True
    for line in so.lines:
        # Top-up reservation from free stock for anything still outstanding.
        outstanding = round(line.qty - line.qty_reserved, 4)
        if outstanding > 0:
            free = inventory_service.get_availability(session, line.product_id)["free_to_use"]
            top = max(0.0, min(free, outstanding))
            if top > 0:
                inventory_service.create_move(
                    session,
                    company_id=so.company_id,
                    product_id=line.product_id,
                    qty=top,
                    move_type=MoveType.OUT,
                    source=MoveSource.SALE,
                    state=MoveState.RESERVED,
                    source_doc_id=so.id,
                    note=f"Reserved for {so.name}",
                )
                line.qty_reserved = round(line.qty_reserved + top, 4)

        to_deliver = round(line.qty_reserved - line.qty_delivered, 4)
        if to_deliver > 0:
            reserved_moves = [
                mv
                for mv in inventory_service.reserved_moves_for(
                    session, source=MoveSource.SALE, source_doc_id=so.id
                )
                if mv.product_id == line.product_id
            ]
            remaining = to_deliver
            for mv in reserved_moves:
                if remaining <= 1e-9:
                    break
                if mv.qty <= remaining + 1e-9:
                    inventory_service.complete_move(session, mv)
                    remaining = round(remaining - mv.qty, 4)
                else:
                    # Split: shrink the reservation, post a done move for the delivered part.
                    mv.qty = round(mv.qty - remaining, 4)
                    session.add(mv)
                    inventory_service.create_move(
                        session,
                        company_id=so.company_id,
                        product_id=line.product_id,
                        qty=remaining,
                        move_type=MoveType.OUT,
                        source=MoveSource.SALE,
                        state=MoveState.DONE,
                        source_doc_id=so.id,
                        note=f"Delivered for {so.name}",
                    )
                    remaining = 0.0
            line.qty_delivered = round(line.qty_delivered + to_deliver, 4)
            session.add(line)
            delivered.append({"product_id": line.product_id, "qty": to_deliver})

        if line.qty_delivered + 1e-9 < line.qty:
            fully = False

    so.state = SaleOrderState.FULLY_DELIVERED if fully else SaleOrderState.PARTIALLY_DELIVERED
    session.add(so)
    audit_service.log(
        session,
        company_id=so.company_id,
        entity_type="sale_order",
        entity_id=so.id,
        action="delivered",
        description=f"{so.name} {'fully' if fully else 'partially'} delivered",
        user_id=user.id if user else None,
        payload={"delivered": delivered},
    )
    session.commit()
    emit(
        "sale_order_delivered",
        {"id": so.id, "name": so.name, "state": so.state.value},
        message=f"{so.name} {'fully' if fully else 'partially'} delivered",
    )
    emit("stock_changed", {})
    return {"order": so, "delivered": delivered, "fully": fully}


def cancel_order(session: Session, so: SaleOrder, *, user=None) -> SaleOrder:
    if so.state != SaleOrderState.DRAFT:
        raise ValueError("Only draft sale orders can be cancelled")
    so.state = SaleOrderState.CANCELLED
    session.add(so)
    audit_service.log(
        session,
        company_id=so.company_id,
        entity_type="sale_order",
        entity_id=so.id,
        action="cancelled",
        description=f"{so.name} cancelled",
        user_id=user.id if user else None,
    )
    session.commit()
    session.refresh(so)
    emit("sale_order_cancelled", {"id": so.id, "name": so.name})
    return so
