"""Shared input-validation helpers used by the auth/user schemas.

Keeping the password policy and login-id rule in one place means the signup
endpoint, the admin user-create endpoint, and (via mirrored logic) the
frontend all agree on exactly what "valid" means.
"""

import re

PASSWORD_MIN_LENGTH = 8
_SPECIALS = r"!@#$%^&*()_+\-=\[\]{};:'\",.<>/?\\|`~"

USERNAME_MIN = 6
USERNAME_MAX = 12


def validate_strong_password(value: str) -> str:
    """Return the password if it satisfies the policy, else raise ValueError
    with a message naming the first failing rule.

    Policy: >= 8 chars, at least one lowercase, one uppercase, one digit, one
    special character, and no whitespace.
    """
    if value is None or len(value) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"Password must be at least {PASSWORD_MIN_LENGTH} characters.")
    if re.search(r"\s", value):
        raise ValueError("Password must not contain spaces.")
    if not re.search(r"[a-z]", value):
        raise ValueError("Password must contain a lowercase letter.")
    if not re.search(r"[A-Z]", value):
        raise ValueError("Password must contain an uppercase letter.")
    if not re.search(r"[0-9]", value):
        raise ValueError("Password must contain a number.")
    if not re.search(f"[{_SPECIALS}]", value):
        raise ValueError("Password must contain a special character.")
    return value


def validate_username(value: str) -> str:
    """Username: alphanumeric, 6-12 characters (brief rule)."""
    value = (value or "").strip()
    if not (USERNAME_MIN <= len(value) <= USERNAME_MAX):
        raise ValueError(f"Username must be {USERNAME_MIN}-{USERNAME_MAX} characters.")
    if not re.fullmatch(r"[A-Za-z0-9]+", value):
        raise ValueError("Username must be letters and numbers only.")
    return value


_ALLOWED_PHOTO_PREFIXES = (
    "data:image/png;base64,",
    "data:image/jpeg;base64,",
    "data:image/jpg;base64,",
    "data:image/webp;base64,",
    "data:image/gif;base64,",
)
# Base64 inflates ~33%; cap the encoded string so a stray multi-MB upload
# can't bloat the row. ~1.2MB encoded ≈ ~900KB image.
PHOTO_MAX_CHARS = 1_200_000


def validate_photo(value: str | None) -> str:
    """Optional avatar: empty, or a data URL of an allowed image type under the
    size cap. Returns "" when not provided."""
    if not value:
        return ""
    if not value.startswith(_ALLOWED_PHOTO_PREFIXES):
        raise ValueError("Photo must be a PNG, JPEG, WEBP or GIF image.")
    if len(value) > PHOTO_MAX_CHARS:
        raise ValueError("Photo is too large (max ~900KB).")
    return value
