from datetime import datetime

from sqlmodel import Field, SQLModel


class SignupRequest(SQLModel, table=True):
    """A pending, email-unverified signup. Holds the would-be user's details
    (password already hashed) plus a hashed OTP; materialised into a real
    Company + User on successful verification, then deleted."""

    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    username: str = ""
    company_name: str = ""
    full_name: str = ""
    hashed_password: str = ""
    photo: str = ""  # optional base64 data URL

    code_hash: str = ""  # OTP, hashed; never stored in plaintext
    expires_at: datetime
    attempts: int = 0
    last_sent_at: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
