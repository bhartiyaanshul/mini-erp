from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.security import decode_access_token
from app.models import User
from app.models.access import UserModuleAccess
from app.models.enums import ACCESS_RANK, AccessLevel, ModuleName

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise cred_exc
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise cred_exc
    user = session.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise cred_exc
    return user


def load_access(session: Session, user_id: int) -> dict[ModuleName, AccessLevel]:
    """Return the per-module access map for a user, defaulting missing modules
    to NONE so every module is always present."""
    rows = session.exec(select(UserModuleAccess).where(UserModuleAccess.user_id == user_id)).all()
    access = {m: AccessLevel.NONE for m in ModuleName}
    for row in rows:
        access[row.module] = row.level
    return access


# Minimum access level each action requires (derived from the brief's matrix).
ACTION_MIN_LEVEL: dict[str, AccessLevel] = {
    "view": AccessLevel.USER,
    "create": AccessLevel.USER,
    "edit": AccessLevel.USER,
    "production_entry": AccessLevel.USER,
    "approve": AccessLevel.ADMIN,
    "delete": AccessLevel.ADMIN,
    "edit_bom": AccessLevel.ADMIN,
}


def has_access(session: Session, user: User, module: ModuleName, action: str) -> bool:
    """Core access predicate. System Administrators always pass."""
    if user.is_system_admin:
        return True
    required = ACTION_MIN_LEVEL[action]
    access = load_access(session, user.id)
    return ACCESS_RANK[access.get(module, AccessLevel.NONE)] >= ACCESS_RANK[required]


def require_access(module: ModuleName, action: str):
    """Dependency factory gating an endpoint on (module, action)."""

    def checker(
        user: User = Depends(get_current_user),
        session: Session = Depends(get_session),
    ) -> User:
        if not has_access(session, user, module, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You do not have '{action}' access to the {module.value} module.",
            )
        return user

    return checker


def require_any_access(*modules_for_view: ModuleName):
    """Allow if the user can `view` ANY of the given modules (system admin
    always passes). Used for shared resources like Partners."""

    def checker(
        user: User = Depends(get_current_user),
        session: Session = Depends(get_session),
    ) -> User:
        if user.is_system_admin:
            return user
        access = load_access(session, user.id)
        if any(
            ACCESS_RANK[access.get(m, AccessLevel.NONE)] >= ACCESS_RANK[AccessLevel.USER]
            for m in modules_for_view
        ):
            return user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this resource.",
        )

    return checker


def require_system_admin(user: User = Depends(get_current_user)) -> User:
    """Only System Administrators may manage users and view audit logs."""
    if not user.is_system_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System Administrator access required.",
        )
    return user
