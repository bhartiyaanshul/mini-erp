from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, desc, select

from app.core.db import get_session
from app.core.deps import require_access
from app.core.security import create_track_token
from app.events.bus import emit
from app.models import Product, SaleOrder, SaleOrderLine, User
from app.models.enums import ModuleName
from app.schemas import SaleOrderIn
from app.serializers import sale_order_out
from app.services import audit_service, journey_service, sales_service
from app.services.common import next_seq_name

router = APIRouter(prefix="/api/sales", tags=["sales"])

view = require_access(ModuleName.SALES, "view")
create = require_access(ModuleName.SALES, "create")
approve = require_access(ModuleName.SALES, "approve")


def _get_order(session: Session, order_id: int, company_id: int) -> SaleOrder:
    so = session.get(SaleOrder, order_id)
    if not so or so.company_id != company_id:
        raise HTTPException(404, "Sale order not found")
    return so


@router.get("")
def list_orders(session: Session = Depends(get_session), user: User = Depends(view)):
    orders = session.exec(
        select(SaleOrder).where(SaleOrder.company_id == user.company_id).order_by(desc(SaleOrder.id))
    ).all()
    return [sale_order_out(session, so) for so in orders]


@router.get("/{order_id}")
def get_order(order_id: int, session: Session = Depends(get_session), user: User = Depends(view)):
    return sale_order_out(session, _get_order(session, order_id, user.company_id))


@router.get("/{order_id}/journey")
def order_journey(order_id: int, session: Session = Depends(get_session), user: User = Depends(view)):
    """Rich internal timeline: states, reservations and the auto-created MO/PO docs."""
    return journey_service.build_journey(session, _get_order(session, order_id, user.company_id))


@router.get("/{order_id}/track-link")
def order_track_link(order_id: int, session: Session = Depends(get_session), user: User = Depends(view)):
    """Mint a signed, shareable public tracking link for this order."""
    so = _get_order(session, order_id, user.company_id)
    token = create_track_token(so.id)
    return {"token": token, "path": f"/track/{token}"}


@router.post("")
def create_order(data: SaleOrderIn, session: Session = Depends(get_session), user: User = Depends(create)):
    if not data.lines:
        raise HTTPException(400, "A sale order needs at least one line")
    so = SaleOrder(
        company_id=user.company_id,
        name=next_seq_name(session, SaleOrder, "SO", user.company_id),
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
        company_id=user.company_id,
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
def confirm_order(order_id: int, session: Session = Depends(get_session), user: User = Depends(approve)):
    so = _get_order(session, order_id, user.company_id)
    try:
        result = sales_service.confirm_order(session, so, user=user)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"order": sale_order_out(session, result["order"]), "procurements": result["procurements"]}


@router.post("/{order_id}/deliver")
def deliver_order(order_id: int, session: Session = Depends(get_session), user: User = Depends(approve)):
    so = _get_order(session, order_id, user.company_id)
    try:
        result = sales_service.deliver_order(session, so, user=user)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"order": sale_order_out(session, result["order"]), "delivered": result["delivered"], "fully": result["fully"]}


@router.post("/{order_id}/cancel")
def cancel_order(order_id: int, session: Session = Depends(get_session), user: User = Depends(approve)):
    so = _get_order(session, order_id, user.company_id)
    try:
        so = sales_service.cancel_order(session, so, user=user)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return sale_order_out(session, so)
