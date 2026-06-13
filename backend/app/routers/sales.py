from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, desc, select

from app.core.db import get_session
from app.core.deps import require_role
from app.events.bus import emit
from app.models import Product, SaleOrder, SaleOrderLine, User
from app.models.enums import UserRole
from app.schemas import SaleOrderIn
from app.serializers import sale_order_out
from app.services import audit_service, sales_service
from app.services.common import next_seq_name

router = APIRouter(prefix="/api/sales", tags=["sales"])

gate = require_role(UserRole.SALES)


@router.get("")
def list_orders(session: Session = Depends(get_session), _: User = Depends(gate)):
    orders = session.exec(select(SaleOrder).order_by(desc(SaleOrder.id))).all()
    return [sale_order_out(session, so) for so in orders]


@router.get("/{order_id}")
def get_order(order_id: int, session: Session = Depends(get_session), _: User = Depends(gate)):
    so = session.get(SaleOrder, order_id)
    if not so:
        raise HTTPException(404, "Sale order not found")
    return sale_order_out(session, so)


@router.post("")
def create_order(data: SaleOrderIn, session: Session = Depends(get_session), user: User = Depends(gate)):
    if not data.lines:
        raise HTTPException(400, "A sale order needs at least one line")
    so = SaleOrder(
        name=next_seq_name(session, SaleOrder, "SO"),
        partner_id=data.partner_id,
        created_by_id=user.id,
    )
    session.add(so)
    session.flush()
    for ln in data.lines:
        product = session.get(Product, ln.product_id)
        price = ln.unit_price if ln.unit_price is not None else (product.sales_price if product else 0.0)
        session.add(
            SaleOrderLine(sale_order_id=so.id, product_id=ln.product_id, qty=ln.qty, unit_price=price)
        )
    audit_service.log(
        session,
        entity_type="sale_order",
        entity_id=so.id,
        action="created",
        description=f"{so.name} created",
        user_id=user.id,
    )
    session.commit()
    session.refresh(so)
    emit("sale_order_created", {"id": so.id, "name": so.name})
    return sale_order_out(session, so)


@router.post("/{order_id}/confirm")
def confirm_order(order_id: int, session: Session = Depends(get_session), user: User = Depends(gate)):
    so = session.get(SaleOrder, order_id)
    if not so:
        raise HTTPException(404, "Sale order not found")
    try:
        result = sales_service.confirm_order(session, so, user=user)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"order": sale_order_out(session, result["order"]), "procurements": result["procurements"]}


@router.post("/{order_id}/deliver")
def deliver_order(order_id: int, session: Session = Depends(get_session), user: User = Depends(gate)):
    so = session.get(SaleOrder, order_id)
    if not so:
        raise HTTPException(404, "Sale order not found")
    try:
        result = sales_service.deliver_order(session, so, user=user)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"order": sale_order_out(session, result["order"]), "delivered": result["delivered"], "fully": result["fully"]}


@router.post("/{order_id}/cancel")
def cancel_order(order_id: int, session: Session = Depends(get_session), user: User = Depends(gate)):
    so = session.get(SaleOrder, order_id)
    if not so:
        raise HTTPException(404, "Sale order not found")
    try:
        so = sales_service.cancel_order(session, so, user=user)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return sale_order_out(session, so)
