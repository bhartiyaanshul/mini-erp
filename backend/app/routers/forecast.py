from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.db import get_session
from app.core.deps import get_current_user, require_role
from app.events.bus import emit
from app.models import Product, User
from app.models.enums import UserRole
from app.schemas import ForecastActIn
from app.services import ai_service, audit_service, forecast_service, procurement_service

router = APIRouter(prefix="/api/forecast", tags=["forecast"])

# Acting on a recommendation creates real POs/MOs: same roles that own procurement.
act_gate = require_role(UserRole.PURCHASE, UserRole.MANUFACTURING, UserRole.OWNER)


@router.get("")
def forecast(session: Session = Depends(get_session), _: User = Depends(get_current_user)):
    """Deterministic per-product forecast rows (fast; powers the table)."""
    return forecast_service.forecast_all(session)


@router.get("/briefing")
def briefing(session: Session = Depends(get_session), _: User = Depends(get_current_user)):
    """Forecast rows + an AI (Groq) narration. Falls back to a template offline."""
    rows = forecast_service.forecast_all(session)
    return {"rows": rows, "briefing": ai_service.procurement_briefing(rows)}


@router.post("/act")
def act(data: ForecastActIn, session: Session = Depends(get_session), user: User = Depends(act_gate)):
    """Turn a recommendation into a real MO/PO via the existing procurement engine.

    Mirrors `sales_service.confirm_order`: procure (flush-only) → commit → emit,
    so it flows through the same audit trail and lights up the live dashboard.
    """
    product = session.get(Product, data.product_id)
    if not product:
        raise HTTPException(404, "Product not found")

    res = procurement_service.procure(
        session, product_id=data.product_id, qty=data.qty, origin="Forecast", user=user
    )
    audit_service.log(
        session,
        entity_type="forecast",
        entity_id=data.product_id,
        action="acted_on_recommendation",
        description=res["message"],
        user_id=user.id,
        payload={"product_id": data.product_id, "qty": data.qty, "doc": res.get("doc_name")},
    )
    session.commit()

    if res["kind"] in ("manufacture", "buy"):
        emit(
            "procurement_triggered",
            {
                "kind": res["kind"],
                "doc_name": res["doc_name"],
                "doc_id": res["doc_id"],
                "qty": res["qty"],
                "product": res["product"],
                "origin": "Forecast",
            },
            message=res["message"],
        )
    emit("stock_changed", {})
    return res
