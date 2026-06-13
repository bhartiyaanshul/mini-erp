from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.db import get_session
from app.core.deps import get_current_user
from app.models import User
from app.schemas import ChatIn, AssistantExecuteIn
from app.services import assistant_service
from app.services.assistant_service import BadAction, PermissionDenied

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


@router.post("/chat")
def chat(data: ChatIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    return assistant_service.chat(session, user, [m.model_dump() for m in data.messages])


@router.post("/execute")
def execute(data: AssistantExecuteIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Run a confirmed assistant action. RBAC is enforced per action type inside."""
    try:
        return assistant_service.execute(session, user, data.action.model_dump())
    except PermissionDenied as e:
        raise HTTPException(403, str(e))
    except BadAction as e:
        raise HTTPException(400, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
