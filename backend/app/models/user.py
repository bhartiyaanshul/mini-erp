from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.enums import UserRole


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    full_name: str = ""
    hashed_password: str
    role: UserRole = Field(default=UserRole.SALES)
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
