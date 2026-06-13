from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.db import get_session
from app.core.deps import require_role
from app.events.bus import emit
from app.models import User
from app.services import seed_service

router = APIRouter(prefix="/api/seed", tags=["seed"])

# require_role() with no args => only Admin passes (everyone else lacks the role).
admin_only = require_role()


@router.post("/demo")
def load_demo(session: Session = Depends(get_session), _: User = Depends(admin_only)):
    result = seed_service.run_demo_seed(session)
    emit("demo_loaded", {}, message="Demo scenario loaded: Shiv Furniture Works")
    emit("stock_changed", {})
    return result
