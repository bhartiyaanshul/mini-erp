"""Inventory Time Machine endpoints — read-only, as-of stock & valuation.

Gated on `product` view, matching the Inventory page. Pure reads over the
immutable ledger; no write paths are touched.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.core.db import get_session
from app.core.deps import require_access
from app.models import User
from app.models.enums import ModuleName
from app.services import timemachine_service

router = APIRouter(prefix="/api/timemachine", tags=["timemachine"])

view = require_access(ModuleName.PRODUCT, "view")


def _parse_at(at: str | None) -> datetime:
    if not at:
        return datetime.utcnow()
    try:
        return datetime.fromisoformat(at.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(400, f"Invalid datetime: {at!r}")


@router.get("/range")
def range_(session: Session = Depends(get_session), user: User = Depends(view)):
    return timemachine_service.ledger_range(session, user.company_id)


@router.get("/snapshot")
def snapshot(
    at: str | None = None,
    hide_empty: bool = True,
    session: Session = Depends(get_session),
    user: User = Depends(view),
):
    return timemachine_service.as_of_snapshot(
        session, user.company_id, _parse_at(at), hide_empty=hide_empty
    )


@router.get("/series")
def series(
    days: int = Query(90, ge=1, le=1825),
    start: str | None = None,
    end: str | None = None,
    bucket: str | None = None,
    product_id: int | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(view),
):
    if start and end:
        s, e = _parse_at(start), _parse_at(end)
    else:
        e = datetime.utcnow()
        s = e - timedelta(days=days)
    if bucket not in ("hour", "day"):
        bucket = "hour" if (e - s).days <= 10 else "day"
    return timemachine_service.value_series(
        session, user.company_id, start=s, end=e, bucket=bucket, product_id=product_id
    )


@router.get("/activity")
def activity(
    start: str | None = None,
    end: str | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(view),
):
    e = _parse_at(end) if end else datetime.utcnow()
    s = _parse_at(start) if start else (e - timedelta(days=30))
    return timemachine_service.activity_feed(session, user.company_id, s, e)
