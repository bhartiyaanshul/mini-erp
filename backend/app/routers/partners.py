from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.deps import require_any_access
from app.models import Partner, User
from app.models.enums import ModuleName, PartnerType
from app.schemas import PartnerIn
from app.serializers import partner_out

router = APIRouter(prefix="/api/partners", tags=["partners"])

# Partners (customers/vendors) are shared by Sales and Purchase.
access = require_any_access(ModuleName.SALES, ModuleName.PURCHASE)


@router.get("")
def list_partners(
    type: PartnerType | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(access),
):
    stmt = select(Partner).where(Partner.company_id == user.company_id)
    if type:
        # 'both' partners qualify as either a customer or a vendor
        stmt = stmt.where((Partner.type == type) | (Partner.type == PartnerType.BOTH))
    stmt = stmt.order_by(Partner.name)
    return [partner_out(p) for p in session.exec(stmt).all()]


@router.post("")
def create_partner(data: PartnerIn, session: Session = Depends(get_session), user: User = Depends(access)):
    p = Partner(company_id=user.company_id, **data.model_dump())
    session.add(p)
    session.commit()
    session.refresh(p)
    return partner_out(p)


@router.delete("/{partner_id}")
def delete_partner(partner_id: int, session: Session = Depends(get_session), user: User = Depends(access)):
    p = session.get(Partner, partner_id)
    if not p or p.company_id != user.company_id:
        raise HTTPException(404, "Partner not found")
    session.delete(p)
    session.commit()
    return {"ok": True}
