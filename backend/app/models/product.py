from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.enums import ProcurementType


class Product(SQLModel, table=True):
    """Central inventory model.

    Note the deliberate absence of any stock column: on-hand / reserved /
    free-to-use are derived from the StockMove ledger, never stored.
    """

    id: int | None = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="company.id", index=True)
    name: str = Field(index=True)
    sku: str = Field(default="", index=True)
    sales_price: float = 0.0
    cost_price: float = 0.0
    uom: str = "Units"

    # Procurement configuration (drives MTS vs MTO automation).
    procure_on_demand: bool = False
    procurement_type: ProcurementType = Field(default=ProcurementType.BUY)
    default_vendor_id: int | None = Field(default=None, foreign_key="partner.id")
    bom_id: int | None = Field(default=None, foreign_key="bom.id")

    created_at: datetime = Field(default_factory=datetime.utcnow)
