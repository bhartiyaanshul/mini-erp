from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.deps import get_current_user, require_role
from app.models import Partner, User
from app.models.enums import PartnerType, UserRole
from app.schemas import PartnerIn
from app.serializers import partner_out

router = APIRouter(prefix="/api/partners", tags=["partners"])

manage = require_role(UserRole.SALES, UserRole.PURCHASE, UserRole.OWNER)


@router.get("")
def list_partners(
    type: PartnerType | None = None,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    stmt = select(Partner).order_by(Partner.name)
    if type:
        # 'both' partners qualify as either a customer or a vendor
        stmt = select(Partner).where(
            (Partner.type == type) | (Partner.type == PartnerType.BOTH)
        ).order_by(Partner.name)
    return [partner_out(p) for p in session.exec(stmt).all()]


@router.post("")
def create_partner(data: PartnerIn, session: Session = Depends(get_session), _: User = Depends(manage)):
    p = Partner(**data.model_dump())
    session.add(p)
    session.commit()
    session.refresh(p)
    return partner_out(p)


@router.delete("/{partner_id}")
def delete_partner(partner_id: int, session: Session = Depends(get_session), _: User = Depends(manage)):
    p = session.get(Partner, partner_id)
    if not p:
        raise HTTPException(404, "Partner not found")
    session.delete(p)
    session.commit()
    return {"ok": True}
