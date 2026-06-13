from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.deps import get_current_user, require_role
from app.models import BoM, BoMLine, BoMOperation, Product, User
from app.models.enums import UserRole
from app.schemas import BoMIn
from app.serializers import bom_out

router = APIRouter(prefix="/api/boms", tags=["bom"])

manage = require_role(UserRole.MANUFACTURING, UserRole.OWNER)


@router.get("")
def list_boms(session: Session = Depends(get_session), _: User = Depends(get_current_user)):
    return [bom_out(session, b) for b in session.exec(select(BoM).order_by(BoM.name)).all()]


@router.get("/{bom_id}")
def get_bom(bom_id: int, session: Session = Depends(get_session), _: User = Depends(get_current_user)):
    b = session.get(BoM, bom_id)
    if not b:
        raise HTTPException(404, "BoM not found")
    return bom_out(session, b)


@router.post("")
def create_bom(data: BoMIn, session: Session = Depends(get_session), _: User = Depends(manage)):
    product = session.get(Product, data.product_id)
    if not product:
        raise HTTPException(404, "Finished product not found")
    bom = BoM(name=data.name, product_id=data.product_id)
    session.add(bom)
    session.flush()
    for ln in data.lines:
        session.add(BoMLine(bom_id=bom.id, component_product_id=ln.component_product_id, qty=ln.qty))
    for op in data.operations:
        session.add(
            BoMOperation(
                bom_id=bom.id,
                name=op.name,
                duration_mins=op.duration_mins,
                work_center=op.work_center,
                sequence=op.sequence,
            )
        )
    # Link the finished product to its recipe.
    product.bom_id = bom.id
    session.add(product)
    session.commit()
    session.refresh(bom)
    return bom_out(session, bom)


@router.put("/{bom_id}")
def update_bom(bom_id: int, data: BoMIn, session: Session = Depends(get_session), _: User = Depends(manage)):
    bom = session.get(BoM, bom_id)
    if not bom:
        raise HTTPException(404, "BoM not found")
    bom.name = data.name
    bom.product_id = data.product_id
    # Replace lines/operations wholesale (simplest correct edit for a demo).
    for ln in session.exec(select(BoMLine).where(BoMLine.bom_id == bom_id)).all():
        session.delete(ln)
    for op in session.exec(select(BoMOperation).where(BoMOperation.bom_id == bom_id)).all():
        session.delete(op)
    session.flush()
    for ln in data.lines:
        session.add(BoMLine(bom_id=bom.id, component_product_id=ln.component_product_id, qty=ln.qty))
    for op in data.operations:
        session.add(
            BoMOperation(
                bom_id=bom.id,
                name=op.name,
                duration_mins=op.duration_mins,
                work_center=op.work_center,
                sequence=op.sequence,
            )
        )
    session.add(bom)
    session.commit()
    session.refresh(bom)
    return bom_out(session, bom)
