from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.db import get_session
from app.core.deps import get_current_user, require_system_admin
from app.models import Company, User
from app.schemas import CompanyBrandingIn, CompanyOut
from app.serializers import company_out
from app.services import audit_service

router = APIRouter(prefix="/api/company", tags=["company"])


def _company(session: Session, company_id: int) -> Company:
    company = session.get(Company, company_id)
    if not company:
        raise HTTPException(404, "Company not found")
    return company


@router.get("", response_model=CompanyOut)
def get_company(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """The caller's company branding — read by every page that prints a document."""
    return company_out(_company(session, user.company_id))


@router.put("", response_model=CompanyOut)
def update_company(
    data: CompanyBrandingIn,
    session: Session = Depends(get_session),
    user: User = Depends(require_system_admin),
):
    """Owner-only branding edit. `user.company_id` scopes the write to the
    caller's own tenant. Only explicitly-set fields are touched."""
    company = _company(session, user.company_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(company, field, value)
    session.add(company)
    audit_service.log(
        session,
        company_id=user.company_id,
        entity_type="company",
        entity_id=company.id,
        action="branding_updated",
        description="Company branding updated",
        user_id=user.id,
    )
    session.commit()
    session.refresh(company)
    return company_out(company)
