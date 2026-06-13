from datetime import datetime

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(default="", index=True, unique=True)
    email: str = Field(index=True, unique=True)
    full_name: str = ""
    hashed_password: str
    company_id: int = Field(foreign_key="company.id", index=True)

    # Account kind: System Administrators manage users and bypass every
    # per-module access check; System Users are gated by UserModuleAccess.
    is_system_admin: bool = False

    # Profile (brief: editable by self, except position which is admin-only).
    address: str = ""
    position: str = ""
    mobile_number: str = ""
    photo: str = ""  # optional base64 data URL

    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
