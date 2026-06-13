"""Public, unauthenticated endpoints reachable via a signed token.

The only thing exposed here is a sanitized order-tracking view — the
customer-facing "track your order like a package" page. Access is gated by the
signature on the token (minted in the authenticated sales module), never by a
login, so a customer can open the link without an account.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.db import get_session
from app.core.security import decode_track_token
from app.models import SaleOrder
from app.services import journey_service

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/track/{token}")
def track_order(token: str, session: Session = Depends(get_session)):
    so_id = decode_track_token(token)
    if so_id is None:
        raise HTTPException(404, "Tracking link is invalid or has expired")
    so = session.get(SaleOrder, so_id)
    if not so:
        raise HTTPException(404, "Order not found")
    return journey_service.public_journey(session, so)
