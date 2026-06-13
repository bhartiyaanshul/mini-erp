from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.db import get_session
from app.core.deps import require_system_admin
from app.events.bus import emit
from app.models import User
from app.services import seed_service

router = APIRouter(prefix="/api/seed", tags=["seed"])


@router.post("/demo")
def load_demo(session: Session = Depends(get_session), admin: User = Depends(require_system_admin)):
    # Seed (and re-seed) the System Administrator's own company.
    result = seed_service.run_demo_seed(session, company_id=admin.company_id)
    emit("demo_loaded", {}, message="Demo scenario loaded: Shiv Furniture Works")
    emit("stock_changed", {})
    return result
