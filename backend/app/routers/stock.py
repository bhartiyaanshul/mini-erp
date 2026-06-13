from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, desc, select

from app.core.db import get_session
from app.core.deps import get_current_user, require_role
from app.events.bus import emit
from app.models import Product, StockMove, User
from app.models.enums import MoveSource, MoveState, MoveType, UserRole
from app.schemas import AdjustIn
from app.serializers import product_out, stock_move_out
from app.services import audit_service, inventory_service

router = APIRouter(prefix="/api/stock", tags=["stock"])

manage = require_role(UserRole.INVENTORY)


@router.post("/adjust")
def adjust_stock(data: AdjustIn, session: Session = Depends(get_session), user: User = Depends(manage)):
    p = session.get(Product, data.product_id)
    if not p:
        raise HTTPException(404, "Product not found")
    if data.qty == 0:
        raise HTTPException(400, "Adjustment quantity cannot be zero")
    move_type = MoveType.IN if data.qty > 0 else MoveType.OUT
    inventory_service.create_move(
        session,
        product_id=p.id,
        qty=abs(data.qty),
        move_type=move_type,
        source=MoveSource.ADJUSTMENT,
        state=MoveState.DONE,
        note=data.note,
    )
    audit_service.log(
        session,
        entity_type="product",
        entity_id=p.id,
        action="stock_adjusted",
        description=f"Stock adjusted by {data.qty:+g} for '{p.name}'",
        user_id=user.id,
        payload={"qty": data.qty, "note": data.note},
    )
    session.commit()
    emit("stock_changed", {"product_id": p.id}, message=f"Stock adjusted: {p.name} {data.qty:+g}")
    return product_out(session, p)


@router.get("/moves")
def list_moves(
    product_id: int | None = None,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    stmt = select(StockMove).order_by(desc(StockMove.created_at)).limit(500)
    if product_id:
        stmt = (
            select(StockMove)
            .where(StockMove.product_id == product_id)
            .order_by(desc(StockMove.created_at))
            .limit(500)
        )
    return [stock_move_out(session, m) for m in session.exec(stmt).all()]


@router.get("/availability/{product_id}")
def availability(product_id: int, session: Session = Depends(get_session), _: User = Depends(get_current_user)):
    return inventory_service.get_availability(session, product_id)
