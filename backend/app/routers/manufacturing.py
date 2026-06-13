from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, desc, select

from app.core.db import get_session
from app.core.deps import require_role
from app.models import ManufacturingOrder, User, WorkOrder
from app.models.enums import UserRole
from app.schemas import MOIn
from app.serializers import mo_out
from app.services import manufacturing_service

router = APIRouter(prefix="/api/manufacturing", tags=["manufacturing"])

gate = require_role(UserRole.MANUFACTURING)


@router.get("/orders")
def list_orders(session: Session = Depends(get_session), _: User = Depends(gate)):
    orders = session.exec(select(ManufacturingOrder).order_by(desc(ManufacturingOrder.id))).all()
    return [mo_out(session, mo) for mo in orders]


@router.get("/orders/{mo_id}")
def get_order(mo_id: int, session: Session = Depends(get_session), _: User = Depends(gate)):
    mo = session.get(ManufacturingOrder, mo_id)
    if not mo:
        raise HTTPException(404, "Manufacturing order not found")
    return mo_out(session, mo)


@router.post("/orders")
def create_order(data: MOIn, session: Session = Depends(get_session), user: User = Depends(gate)):
    mo = manufacturing_service.create_mo(
        session, product_id=data.product_id, qty=data.qty, user=user, auto_confirm=False
    )
    return mo_out(session, mo)


@router.post("/orders/{mo_id}/confirm")
def confirm_order(mo_id: int, session: Session = Depends(get_session), user: User = Depends(gate)):
    mo = session.get(ManufacturingOrder, mo_id)
    if not mo:
        raise HTTPException(404, "Manufacturing order not found")
    try:
        manufacturing_service.confirm_mo(session, mo, user=user)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return mo_out(session, mo)


@router.post("/orders/{mo_id}/complete")
def complete_order(mo_id: int, session: Session = Depends(get_session), user: User = Depends(gate)):
    mo = session.get(ManufacturingOrder, mo_id)
    if not mo:
        raise HTTPException(404, "Manufacturing order not found")
    try:
        manufacturing_service.complete_mo(session, mo, user=user)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return mo_out(session, mo)


@router.post("/workorders/{wo_id}/start")
def start_work_order(wo_id: int, session: Session = Depends(get_session), user: User = Depends(gate)):
    wo = session.get(WorkOrder, wo_id)
    if not wo:
        raise HTTPException(404, "Work order not found")
    manufacturing_service.start_work_order(session, wo, user=user)
    return mo_out(session, session.get(ManufacturingOrder, wo.mo_id))


@router.post("/workorders/{wo_id}/complete")
def complete_work_order(wo_id: int, session: Session = Depends(get_session), user: User = Depends(gate)):
    wo = session.get(WorkOrder, wo_id)
    if not wo:
        raise HTTPException(404, "Work order not found")
    manufacturing_service.complete_work_order(session, wo, user=user)
    return mo_out(session, session.get(ManufacturingOrder, wo.mo_id))
