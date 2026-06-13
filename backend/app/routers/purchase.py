from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, desc, select

from app.core.db import get_session
from app.core.deps import require_role
from app.models import PurchaseOrder, User
from app.models.enums import PurchaseOrderState, UserRole
from app.schemas import PurchaseOrderIn, ReceiveIn
from app.serializers import purchase_order_out
from app.services import purchase_service

router = APIRouter(prefix="/api/purchase", tags=["purchase"])

gate = require_role(UserRole.PURCHASE)


@router.get("")
def list_orders(session: Session = Depends(get_session), _: User = Depends(gate)):
    orders = session.exec(select(PurchaseOrder).order_by(desc(PurchaseOrder.id))).all()
    return [purchase_order_out(session, po) for po in orders]


@router.get("/{order_id}")
def get_order(order_id: int, session: Session = Depends(get_session), _: User = Depends(gate)):
    po = session.get(PurchaseOrder, order_id)
    if not po:
        raise HTTPException(404, "Purchase order not found")
    return purchase_order_out(session, po)


@router.post("")
def create_order(data: PurchaseOrderIn, session: Session = Depends(get_session), user: User = Depends(gate)):
    if not data.lines:
        raise HTTPException(400, "A purchase order needs at least one line")
    po = purchase_service.create_po(
        session,
        vendor_id=data.partner_id,
        line_items=[ln.model_dump() for ln in data.lines],
        user=user,
        auto_confirm=False,
    )
    return purchase_order_out(session, po)


@router.post("/{order_id}/confirm")
def confirm_order(order_id: int, session: Session = Depends(get_session), user: User = Depends(gate)):
    po = session.get(PurchaseOrder, order_id)
    if not po:
        raise HTTPException(404, "Purchase order not found")
    try:
        po = purchase_service.confirm_po(session, po, user=user)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return purchase_order_out(session, po)


@router.post("/{order_id}/receive")
def receive_order(
    order_id: int,
    data: ReceiveIn | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(gate),
):
    po = session.get(PurchaseOrder, order_id)
    if not po:
        raise HTTPException(404, "Purchase order not found")
    if po.state == PurchaseOrderState.DRAFT:
        # Convenience: receiving an unconfirmed PO confirms it implicitly.
        po = purchase_service.confirm_po(session, po, user=user)
    receive_lines = None
    if data and data.lines:
        receive_lines = {ln.line_id: ln.qty for ln in data.lines}
    try:
        result = purchase_service.receive_order(session, po, user=user, receive_lines=receive_lines)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"order": purchase_order_out(session, result["po"]), "received": result["received"], "fully": result["fully"]}
