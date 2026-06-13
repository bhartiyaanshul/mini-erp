from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.config import settings
from app.core.db import get_session
from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.models import Company, SignupRequest, User
from app.models.access import UserModuleAccess
from app.models.enums import AccessLevel, ModuleName
from app.schemas import (
    LoginIn,
    OtpVerifyIn,
    ResendOtpIn,
    SignupRequestIn,
    SignupRequestOut,
    TokenOut,
    UserOut,
)
from app.serializers import user_out
from app.services import email_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token_out(session: Session, user: User) -> TokenOut:
    token = create_access_token(str(user.id), user.company_id)
    return TokenOut(access_token=token, user=UserOut(**user_out(session, user)))


def _require_unique(session: Session, email: str, username: str) -> None:
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if session.exec(select(User).where(User.username == username)).first():
        raise HTTPException(status_code=400, detail="Username already taken")


@router.post("/signup/request", response_model=SignupRequestOut)
def signup_request(data: SignupRequestIn, session: Session = Depends(get_session)):
    """Step 1: validate, stash a pending signup, and email an OTP."""
    _require_unique(session, data.email, data.username)

    code = email_service.generate_otp()
    now = datetime.utcnow()
    expires = now + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    req = session.exec(select(SignupRequest).where(SignupRequest.email == data.email)).first()
    if req is None:
        req = SignupRequest(email=data.email, expires_at=expires, created_at=now)
    req.username = data.username
    req.company_name = data.company_name
    req.full_name = data.full_name or data.username
    req.hashed_password = hash_password(data.password)
    req.photo = data.photo or ""
    req.code_hash = hash_password(code)
    req.expires_at = expires
    req.attempts = 0
    req.last_sent_at = now
    session.add(req)
    session.commit()

    delivered = email_service.send_otp(data.email, code)
    return SignupRequestOut(email=data.email, dev_otp=None if delivered else code)


@router.post("/signup/verify", response_model=TokenOut)
def signup_verify(data: OtpVerifyIn, session: Session = Depends(get_session)):
    """Step 2: confirm the OTP, then create the company + System Admin user."""
    req = session.exec(select(SignupRequest).where(SignupRequest.email == data.email)).first()
    if not req:
        raise HTTPException(status_code=400, detail="No pending signup for this email. Please sign up again.")
    if datetime.utcnow() > req.expires_at:
        session.delete(req)
        session.commit()
        raise HTTPException(status_code=400, detail="Verification code expired. Please sign up again.")
    if req.attempts >= settings.OTP_MAX_ATTEMPTS:
        session.delete(req)
        session.commit()
        raise HTTPException(status_code=400, detail="Too many attempts. Please sign up again.")
    if not verify_password(data.code.strip(), req.code_hash):
        req.attempts += 1
        session.add(req)
        session.commit()
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    # Someone may have grabbed the email/username while the OTP was outstanding.
    _require_unique(session, req.email, req.username)

    company = Company(name=req.company_name)
    session.add(company)
    session.flush()
    user = User(
        username=req.username,
        email=req.email,
        full_name=req.full_name,
        hashed_password=req.hashed_password,
        company_id=company.id,
        is_system_admin=True,
        photo=req.photo,
        is_active=True,
    )
    session.add(user)
    session.flush()
    for module in ModuleName:
        session.add(UserModuleAccess(user_id=user.id, module=module, level=AccessLevel.ADMIN))
    session.delete(req)
    session.commit()
    session.refresh(user)
    return _token_out(session, user)


@router.post("/signup/resend", response_model=SignupRequestOut)
def signup_resend(data: ResendOtpIn, session: Session = Depends(get_session)):
    req = session.exec(select(SignupRequest).where(SignupRequest.email == data.email)).first()
    if not req:
        raise HTTPException(status_code=400, detail="No pending signup for this email.")
    now = datetime.utcnow()
    if (now - req.last_sent_at).total_seconds() < settings.OTP_RESEND_COOLDOWN_SECONDS:
        raise HTTPException(status_code=429, detail="Please wait a moment before requesting another code.")
    code = email_service.generate_otp()
    req.code_hash = hash_password(code)
    req.expires_at = now + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)
    req.attempts = 0
    req.last_sent_at = now
    session.add(req)
    session.commit()
    delivered = email_service.send_otp(data.email, code)
    return SignupRequestOut(email=data.email, dev_otp=None if delivered else code)


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, session: Session = Depends(get_session)):
    ident = data.identifier.strip()
    user = session.exec(select(User).where(User.username == ident)).first()
    if not user:
        user = session.exec(select(User).where(User.email == ident)).first()
    if not user or not user.is_active or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Username or Password")
    return _token_out(session, user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return UserOut(**user_out(session, user))
