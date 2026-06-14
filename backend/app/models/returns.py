from datetime import datetime

from sqlmodel import Field, Relationship, SQLModel

from app.models.enums import ReturnState


class CustomerReturn(SQLModel, table=True):
    """A reverse flow: goods coming back from a customer against a delivered
    sale order. Processing it posts IN moves (restock) and optional SCRAP OUT
    moves to the same immutable StockMove ledger, and records the credit owed
    back to the customer. The original order is referenced by `sale_order_id`.
    """

    id: int | None = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="company.id", index=True)
    name: str = Field(default="", index=True)  # human ref e.g. RMA-0001
    sale_order_id: int = Field(foreign_key="saleorder.id", index=True)
    partner_id: int = Field(foreign_key="partner.id")
    state: ReturnState = Field(default=ReturnState.DRAFT, index=True)
    reason: str = ""
    credit_total: float = 0.0  # value credited to the customer, stamped on process
    created_by_id: int | None = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    processed_at: datetime | None = None

    lines: list["CustomerReturnLine"] = Relationship(
        back_populates="return_order",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class CustomerReturnLine(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    customer_return_id: int = Field(foreign_key="customerreturn.id", index=True)
    sale_order_line_id: int = Field(foreign_key="saleorderline.id")
    product_id: int = Field(foreign_key="product.id")
    qty: float = 0.0  # total units coming back
    qty_scrap: float = 0.0  # of which written off (unsellable); the rest restocks
    unit_price: float = 0.0  # snapshot of the original sale price, for the credit

    return_order: CustomerReturn | None = Relationship(back_populates="lines")
