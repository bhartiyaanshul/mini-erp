from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from app.core.config import settings

# pbkdf2_sha256 is pure-Python (stdlib hashlib), no native build required,
# and plenty strong for this demo. Swap to bcrypt/argon2 for production.
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str, company_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    # company_id is carried for convenience only; enforcement always loads the
    # live user (and thus the authoritative company_id) from the database.
    payload = {"sub": subject, "company_id": company_id, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None


def create_track_token(sale_order_id: int) -> str:
    """Sign a durable, unguessable token for a public order-tracking link.

    No expiry: a tracking link is meant to keep working for the customer's whole
    order lifecycle. The signature (not secrecy of the id) is what gates access,
    so we never expose the raw order id. `typ` namespaces it away from auth tokens.
    """
    payload = {"sub": str(sale_order_id), "typ": "track"}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_track_token(token: str) -> int | None:
    """Return the sale-order id encoded in a track token, or None if invalid."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != "track":
        return None
    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        return None
