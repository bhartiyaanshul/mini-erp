"""Returns / RMA — the reverse of the sale flow.

A customer return brings goods back against a delivered sale order. Processing it
leans on the same immutable StockMove ledger the forward flow uses: every returned
unit posts a DONE **IN** move (restock), and any unsellable portion posts a DONE
**OUT** move with source SCRAP (write-off). Net on-hand effect is the restocked
quantity becoming free-to-use again. The credit owed is the returned value at the
original sale price.

`already-returned` per line is derived from COMPLETED returns (no column added to
the sale order), so validation stays correct across multiple partial returns.
"""

from datetime import datetime

from sqlmodel import Session, select

from app.events.bus import emit
from app.models import CustomerReturn, CustomerReturnLine, Partner, Product, SaleOrder, SaleOrderLine
from app.models.enums import MoveSource, MoveState, MoveType, ReturnState
from app.services import audit_service, inventory_service
from app.services.common import fmt_qty

EPS = 1e-9


def returned_map(session: Session, sale_order_ids: list[int]) -> dict[int, float]:
    """sale_order_line_id -> total qty already returned on COMPLETED returns.

    Batched over many orders to avoid an N+1 when the Returns form lists every
    returnable order at once.
    """
    if not sale_order_ids:
        return {}
    rows = session.exec(
        select(CustomerReturnLine, CustomerReturn)
        .where(CustomerReturnLine.customer_return_id == CustomerReturn.id)
        .where(CustomerReturn.sale_order_id.in_(sale_order_ids))
        .where(CustomerReturn.state == ReturnState.COMPLETED)
    ).all()
    out: dict[int, float] = {}
    for line, _ret in rows:
        out[line.sale_order_line_id] = round(out.get(line.sale_order_line_id, 0.0) + line.qty, 4)
    return out


def returnable_orders(session: Session, company_id: int) -> list[dict]:
    """Delivered sale orders that still have units eligible to come back.

    For each line, returnable = delivered − already-returned. Lines and orders
    with nothing left to return are omitted, so the Returns form only ever
    offers real options.
    """
    orders = session.exec(
        select(SaleOrder).where(SaleOrder.company_id == company_id).order_by(SaleOrder.id.desc())
    ).all()
    delivered = [o for o in orders if any(ln.qty_delivered > 0 for ln in o.lines)]
    rmap = returned_map(session, [o.id for o in delivered])

    result: list[dict] = []
    for o in delivered:
        lines = []
        for ln in o.lines:
            returned = rmap.get(ln.id, 0.0)
            returnable = round(ln.qty_delivered - returned, 4)
            if returnable <= EPS:
                continue
            product = session.get(Product, ln.product_id)
            lines.append(
                {
                    "sale_order_line_id": ln.id,
                    "product_id": ln.product_id,
                    "product_name": product.name if product else None,
                    "unit_price": ln.unit_price,
                    "qty_delivered": ln.qty_delivered,
                    "qty_returned": returned,
                    "returnable": returnable,
                }
            )
        if not lines:
            continue
        partner = session.get(Partner, o.partner_id)
        result.append(
            {
                "id": o.id,
                "name": o.name,
                "partner_id": o.partner_id,
                "partner_name": partner.name if partner else None,
                "order_date": o.order_date.isoformat() if o.order_date else None,
                "lines": lines,
            }
        )
    return result


def process_return(session: Session, ret: CustomerReturn, *, user=None) -> dict:
    """Post the reverse ledger moves and stamp the credit. DRAFT -> COMPLETED.

    Re-validates each line against the *current* delivered − returned (a draft
    holds no reservation, so two drafts could otherwise over-return the same
    units). Restocked goods become free-to-use again; scrapped goods are written
    off in the same transaction so the ledger keeps a full, auditable trail.
    """
    if ret.state != ReturnState.DRAFT:
        raise ValueError(f"Return {ret.name} cannot be processed from state '{ret.state.value}'")

    so = session.get(SaleOrder, ret.sale_order_id)
    rmap = returned_map(session, [ret.sale_order_id])
    credit = 0.0
    restocked = 0.0
    scrapped = 0.0

    for ln in ret.lines:
        soline = session.get(SaleOrderLine, ln.sale_order_line_id)
        if not soline or soline.sale_order_id != ret.sale_order_id:
            raise ValueError("A return line does not belong to the original order")

        product = session.get(Product, ln.product_id)
        pname = product.name if product else f"product #{ln.product_id}"
        max_returnable = round(soline.qty_delivered - rmap.get(ln.sale_order_line_id, 0.0), 4)
        if ln.qty > max_returnable + EPS:
            raise ValueError(
                f"Cannot return {fmt_qty(ln.qty)} {pname} — only {fmt_qty(max_returnable)} "
                "delivered unit(s) remain returnable"
            )
        if ln.qty_scrap < -EPS or ln.qty_scrap > ln.qty + EPS:
            raise ValueError(f"Scrapped qty for {pname} must be between 0 and the returned qty")

        # Goods physically return → IN move restores them to the ledger.
        inventory_service.create_move(
            session,
            company_id=ret.company_id,
            product_id=ln.product_id,
            qty=ln.qty,
            move_type=MoveType.IN,
            source=MoveSource.RETURN,
            state=MoveState.DONE,
            source_doc_id=ret.id,
            note=f"Returned from {so.name if so else 'order'} ({ret.name})",
        )
        # The unsellable portion is immediately written off → OUT scrap move.
        if ln.qty_scrap > EPS:
            inventory_service.create_move(
                session,
                company_id=ret.company_id,
                product_id=ln.product_id,
                qty=ln.qty_scrap,
                move_type=MoveType.OUT,
                source=MoveSource.SCRAP,
                state=MoveState.DONE,
                source_doc_id=ret.id,
                note=f"Scrapped on {ret.name}",
            )

        credit += ln.qty * ln.unit_price
        restocked += ln.qty - ln.qty_scrap
        scrapped += ln.qty_scrap

    ret.credit_total = round(credit, 2)
    ret.state = ReturnState.COMPLETED
    ret.processed_at = datetime.utcnow()
    session.add(ret)
    audit_service.log(
        session,
        company_id=ret.company_id,
        entity_type="customer_return",
        entity_id=ret.id,
        action="processed",
        description=(
            f"{ret.name} processed — {fmt_qty(round(restocked, 4))} restocked, "
            f"{fmt_qty(round(scrapped, 4))} scrapped, credit {ret.credit_total}"
        ),
        user_id=user.id if user else None,
        payload={"credit_total": ret.credit_total, "restocked": round(restocked, 4), "scrapped": round(scrapped, 4)},
    )
    session.commit()
    session.refresh(ret)

    emit(
        "return_processed",
        {"id": ret.id, "name": ret.name, "credit": ret.credit_total},
        message=f"{ret.name} processed — credit note {ret.credit_total}",
    )
    emit("stock_changed", {})
    return {
        "return": ret,
        "restocked": round(restocked, 4),
        "scrapped": round(scrapped, 4),
        "credit": ret.credit_total,
    }


def cancel_return(session: Session, ret: CustomerReturn, *, user=None) -> CustomerReturn:
    if ret.state != ReturnState.DRAFT:
        raise ValueError("Only draft returns can be cancelled")
    ret.state = ReturnState.CANCELLED
    session.add(ret)
    audit_service.log(
        session,
        company_id=ret.company_id,
        entity_type="customer_return",
        entity_id=ret.id,
        action="cancelled",
        description=f"{ret.name} cancelled",
        user_id=user.id if user else None,
    )
    session.commit()
    session.refresh(ret)
    emit("return_cancelled", {"id": ret.id, "name": ret.name})
    return ret
