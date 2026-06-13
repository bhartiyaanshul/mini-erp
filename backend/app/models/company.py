from datetime import datetime

from sqlmodel import Field, SQLModel


class Company(SQLModel, table=True):
    """A tenant. Every business record carries this company's id and is only
    ever read back through queries scoped to it."""

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
