from datetime import datetime

from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel


class AuditLog(SQLModel, table=True):
    """Append-only record of every significant change in the system."""

    id: int | None = Field(default=None, primary_key=True)
    entity_type: str = Field(index=True)
    entity_id: int | None = Field(default=None, index=True)
    action: str
    description: str = ""
    user_id: int | None = Field(default=None, foreign_key="user.id")
    payload: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
