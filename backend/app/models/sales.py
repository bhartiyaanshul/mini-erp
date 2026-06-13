from datetime import datetime

from sqlmodel import Field, Relationship, SQLModel

from app.models.enums import SaleOrderState


class SaleOrder(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="company.id", index=True)
    name: str = Field(default="", index=True)  # human ref e.g. SO-0001
    partner_id: int = Field(foreign_key="partner.id")
    state: SaleOrderState = Field(default=SaleOrderState.DRAFT, index=True)
    order_date: datetime = Field(default_factory=datetime.utcnow)
    promise_date: datetime | None = None
    created_by_id: int | None = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    lines: list["SaleOrderLine"] = Relationship(
        back_populates="order",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class SaleOrderLine(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    sale_order_id: int = Field(foreign_key="saleorder.id", index=True)
    product_id: int = Field(foreign_key="product.id")
    qty: float = 1.0
    qty_reserved: float = 0.0
    qty_delivered: float = 0.0
    unit_price: float = 0.0

    order: SaleOrder | None = Relationship(back_populates="lines")
