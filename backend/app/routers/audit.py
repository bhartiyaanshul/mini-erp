from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.db import get_session
from app.core.deps import get_current_user, require_role
from app.models import Product, User
from app.models.enums import MoveSource, MoveState, MoveType, UserRole
from app.serializers import audit_out
from app.services import audit_service, inventory_service
from app.services.common import fmt_qty

router = APIRouter(prefix="/api/audit", tags=["audit"])

view = require_role(UserRole.OWNER)


@router.get("")
def list_logs(
    entity_type: str | None = None,
    limit: int = 200,
    session: Session = Depends(get_session),
    _: User = Depends(view),
):
    return [audit_out(session, a) for a in audit_service.list_logs(session, entity_type=entity_type, limit=limit)]


@router.get("/timeline/{product_id}")
def product_timeline(product_id: int, session: Session = Depends(get_session), _: User = Depends(get_current_user)):
    """All stock movements for one product, built from the ledger."""
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")

    events: list[dict] = []
    for m in inventory_service.moves_for_product(session, product_id):
        title, kind = _describe_move(m)
        sign = "+" if m.move_type == MoveType.IN else "-"
        events.append(
            {
                "ts": m.created_at.isoformat() if m.created_at else None,
                "kind": kind,
                "title": title,
                "qty": f"{sign}{fmt_qty(m.qty)}",
                "state": m.state.value,
                "note": m.note,
                "source": m.source.value,
            }
        )

    avail = inventory_service.get_availability(session, product_id)
    return {
        "product": {"id": product.id, "name": product.name, **avail},
        "events": events,
    }


def _describe_move(m) -> tuple[str, str]:
    s, st, mt = m.source, m.state, m.move_type
    if s == MoveSource.ADJUSTMENT:
        return ("Stock adjustment", "adjustment")
    if s == MoveSource.SALE:
        if st == MoveState.RESERVED:
            return ("Reserved for a sale order", "reserved")
        return ("Delivered to customer", "delivered")
    if s == MoveSource.PURCHASE:
        return ("Received from vendor", "received")
    if s == MoveSource.MANUFACTURING_PRODUCE:
        return ("Manufactured (finished goods)", "manufactured")
    if s == MoveSource.MANUFACTURING_CONSUME:
        if st == MoveState.RESERVED:
            return ("Reserved as a component", "reserved")
        return ("Consumed as a component", "consumed")
    return ("Stock move", "move")
