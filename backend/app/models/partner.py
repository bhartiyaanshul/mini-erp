from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.enums import PartnerType


class Partner(SQLModel, table=True):
    """A customer, a vendor, or both: one table, role distinguished by type."""

    id: int | None = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="company.id", index=True)
    name: str = Field(index=True)
    type: PartnerType = Field(default=PartnerType.CUSTOMER)
    email: str = ""
    phone: str = ""
    address: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
