from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.db import get_session
from app.core.deps import get_current_user
from app.models import User
from app.services import dashboard_service

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def metrics(session: Session = Depends(get_session), _: User = Depends(get_current_user)):
    return dashboard_service.get_metrics(session)


@router.get("/low-stock")
def low_stock(threshold: float = 10.0, session: Session = Depends(get_session), _: User = Depends(get_current_user)):
    return dashboard_service.low_stock(session, threshold)
