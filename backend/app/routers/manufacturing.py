from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, desc, select

from app.core.db import get_session
from app.core.deps import require_access
from app.models import ManufacturingOrder, Product, User, WorkOrder
from app.models.enums import ModuleName
from app.schemas import MOIn
from app.serializers import mo_out
from app.services import manufacturing_service

router = APIRouter(prefix="/api/manufacturing", tags=["manufacturing"])

view = require_access(ModuleName.MANUFACTURING, "view")
create = require_access(ModuleName.MANUFACTURING, "create")
approve = require_access(ModuleName.MANUFACTURING, "approve")
production = require_access(ModuleName.MANUFACTURING, "production_entry")


def _get_mo(session: Session, mo_id: int, company_id: int) -> ManufacturingOrder:
    mo = session.get(ManufacturingOrder, mo_id)
    if not mo or mo.company_id != company_id:
        raise HTTPException(404, "Manufacturing order not found")
    return mo


def _get_wo(session: Session, wo_id: int, company_id: int) -> WorkOrder:
    wo = session.get(WorkOrder, wo_id)
    if not wo:
        raise HTTPException(404, "Work order not found")
    mo = session.get(ManufacturingOrder, wo.mo_id)
    if not mo or mo.company_id != company_id:
        raise HTTPException(404, "Work order not found")
    return wo


@router.get("/orders")
def list_orders(session: Session = Depends(get_session), user: User = Depends(view)):
    orders = session.exec(
        select(ManufacturingOrder)
        .where(ManufacturingOrder.company_id == user.company_id)
        .order_by(desc(ManufacturingOrder.id))
    ).all()
    return [mo_out(session, mo) for mo in orders]


@router.get("/orders/{mo_id}")
def get_order(mo_id: int, session: Session = Depends(get_session), user: User = Depends(view)):
    return mo_out(session, _get_mo(session, mo_id, user.company_id))


@router.post("/orders")
def create_order(data: MOIn, session: Session = Depends(get_session), user: User = Depends(create)):
    product = session.get(Product, data.product_id)
    if not product or product.company_id != user.company_id:
        raise HTTPException(404, "Product not found")
    mo = manufacturing_service.create_mo(
        session,
        company_id=user.company_id,
        product_id=data.product_id,
        qty=data.qty,
        user=user,
        auto_confirm=False,
    )
    return mo_out(session, mo)


@router.post("/orders/{mo_id}/confirm")
def confirm_order(mo_id: int, session: Session = Depends(get_session), user: User = Depends(approve)):
    mo = _get_mo(session, mo_id, user.company_id)
    try:
        manufacturing_service.confirm_mo(session, mo, user=user)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return mo_out(session, mo)


@router.post("/orders/{mo_id}/complete")
def complete_order(mo_id: int, session: Session = Depends(get_session), user: User = Depends(approve)):
    mo = _get_mo(session, mo_id, user.company_id)
    try:
        manufacturing_service.complete_mo(session, mo, user=user)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return mo_out(session, mo)


@router.post("/workorders/{wo_id}/start")
def start_work_order(wo_id: int, session: Session = Depends(get_session), user: User = Depends(production)):
    wo = _get_wo(session, wo_id, user.company_id)
    manufacturing_service.start_work_order(session, wo, user=user)
    return mo_out(session, session.get(ManufacturingOrder, wo.mo_id))


@router.post("/workorders/{wo_id}/complete")
def complete_work_order(wo_id: int, session: Session = Depends(get_session), user: User = Depends(production)):
    wo = _get_wo(session, wo_id, user.company_id)
    manufacturing_service.complete_work_order(session, wo, user=user)
    return mo_out(session, session.get(ManufacturingOrder, wo.mo_id))
