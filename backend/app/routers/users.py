from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.deps import get_current_user, require_system_admin
from app.core.security import hash_password
from app.models import User
from app.models.access import UserModuleAccess
from app.models.enums import AccessLevel, ModuleName
from app.schemas import AccessUpdateIn, UserAdminOut, UserCreateIn, UserUpdateIn
from app.serializers import user_admin_out
from app.services import audit_service

router = APIRouter(prefix="/api/users", tags=["users"])


def _set_access(session: Session, user_id: int, access: dict[ModuleName, AccessLevel]) -> None:
    """Replace a user's per-module access rows with the given map."""
    existing = {
        row.module: row
        for row in session.exec(select(UserModuleAccess).where(UserModuleAccess.user_id == user_id)).all()
    }
    for module in ModuleName:
        level = access.get(module, AccessLevel.NONE)
        row = existing.get(module)
        if row is None:
            session.add(UserModuleAccess(user_id=user_id, module=module, level=level))
        else:
            row.level = level
            session.add(row)


def _get_company_user(session: Session, user_id: int, company_id: int) -> User:
    user = session.get(User, user_id)
    if not user or user.company_id != company_id:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("", response_model=list[UserAdminOut])
def list_users(admin: User = Depends(require_system_admin), session: Session = Depends(get_session)):
    users = session.exec(
        select(User).where(User.company_id == admin.company_id).order_by(User.full_name)
    ).all()
    return [UserAdminOut(**user_admin_out(session, u)) for u in users]


@router.post("", response_model=UserAdminOut)
def create_user(
    data: UserCreateIn,
    admin: User = Depends(require_system_admin),
    session: Session = Depends(get_session),
):
    if session.exec(select(User).where(User.email == data.email)).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if session.exec(select(User).where(User.username == data.username)).first():
        raise HTTPException(status_code=400, detail="Username already taken")

    user = User(
        username=data.username,
        email=data.email,
        full_name=data.full_name or data.username,
        hashed_password=hash_password(data.password),
        company_id=admin.company_id,
        is_system_admin=data.is_system_admin,
        address=data.address,
        position=data.position,
        mobile_number=data.mobile_number,
        photo=data.photo or "",
        is_active=True,
    )
    session.add(user)
    session.flush()
    _set_access(session, user.id, data.access)
    audit_service.log(
        session,
        company_id=admin.company_id,
        entity_type="user",
        entity_id=user.id,
        action="created",
        description=f"Created user {user.username}",
        user_id=admin.id,
    )
    session.commit()
    session.refresh(user)
    return UserAdminOut(**user_admin_out(session, user))


@router.get("/{user_id}", response_model=UserAdminOut)
def get_user(
    user_id: int,
    actor: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not actor.is_system_admin and actor.id != user_id:
        raise HTTPException(status_code=403, detail="System Administrator access required.")
    user = _get_company_user(session, user_id, actor.company_id)
    return UserAdminOut(**user_admin_out(session, user))


@router.put("/{user_id}", response_model=UserAdminOut)
def update_user(
    user_id: int,
    data: UserUpdateIn,
    actor: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    is_self = actor.id == user_id
    if not actor.is_system_admin and not is_self:
        raise HTTPException(status_code=403, detail="System Administrator access required.")
    user = _get_company_user(session, user_id, actor.company_id)

    # Self-editable profile fields (also editable by admin).
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.address is not None:
        user.address = data.address
    if data.mobile_number is not None:
        user.mobile_number = data.mobile_number
    if data.photo is not None:
        user.photo = data.photo

    # Admin-only fields.
    if data.position is not None:
        if not actor.is_system_admin:
            raise HTTPException(status_code=403, detail="Only a System Administrator can change Position.")
        user.position = data.position
    if data.is_system_admin is not None:
        if not actor.is_system_admin:
            raise HTTPException(status_code=403, detail="Only a System Administrator can change this.")
        if is_self and not data.is_system_admin and _is_last_admin(session, actor):
            raise HTTPException(status_code=400, detail="You are the last System Administrator.")
        user.is_system_admin = data.is_system_admin
    if data.is_active is not None:
        if not actor.is_system_admin:
            raise HTTPException(status_code=403, detail="Only a System Administrator can change this.")
        if not data.is_active and user.is_system_admin and _is_last_admin(session, user):
            raise HTTPException(status_code=400, detail="Cannot deactivate the last System Administrator.")
        user.is_active = data.is_active

    session.add(user)
    audit_service.log(
        session,
        company_id=actor.company_id,
        entity_type="user",
        entity_id=user.id,
        action="updated",
        description=f"Updated user {user.username}",
        user_id=actor.id,
    )
    session.commit()
    session.refresh(user)
    return UserAdminOut(**user_admin_out(session, user))


@router.put("/{user_id}/access", response_model=UserAdminOut)
def update_access(
    user_id: int,
    data: AccessUpdateIn,
    admin: User = Depends(require_system_admin),
    session: Session = Depends(get_session),
):
    user = _get_company_user(session, user_id, admin.company_id)
    _set_access(session, user.id, data.access)
    audit_service.log(
        session,
        company_id=admin.company_id,
        entity_type="user",
        entity_id=user.id,
        action="access_updated",
        description=f"Updated access for {user.username}",
        user_id=admin.id,
        payload={m.value: lvl.value for m, lvl in data.access.items()},
    )
    session.commit()
    session.refresh(user)
    return UserAdminOut(**user_admin_out(session, user))


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    admin: User = Depends(require_system_admin),
    session: Session = Depends(get_session),
):
    user = _get_company_user(session, user_id, admin.company_id)
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")
    if user.is_system_admin and _is_last_admin(session, user):
        raise HTTPException(status_code=400, detail="Cannot delete the last System Administrator.")
    # Deactivate rather than hard-delete so historical references stay intact.
    user.is_active = False
    session.add(user)
    audit_service.log(
        session,
        company_id=admin.company_id,
        entity_type="user",
        entity_id=user.id,
        action="deactivated",
        description=f"Deactivated user {user.username}",
        user_id=admin.id,
    )
    session.commit()
    return {"ok": True, "id": user_id}


def _is_last_admin(session: Session, user: User) -> bool:
    """True if `user` is the only active System Administrator in their company."""
    admins = session.exec(
        select(User).where(
            User.company_id == user.company_id,
            User.is_system_admin == True,  # noqa: E712
            User.is_active == True,  # noqa: E712
        )
    ).all()
    return len(admins) <= 1 and any(a.id == user.id for a in admins)