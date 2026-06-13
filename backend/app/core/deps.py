from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session

from app.core.db import get_session
from app.core.security import decode_access_token
from app.models import User
from app.models.enums import UserRole

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


def require_role(*roles: UserRole):
    """Dependency factory. Admin bypasses every check."""

    allowed = set(roles)

    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role == UserRole.ADMIN:
            return user
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role.value}' is not permitted to access this resource.",
            )
        return user

    return checker
