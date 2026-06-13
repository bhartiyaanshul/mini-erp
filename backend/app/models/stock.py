from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.enums import MoveSource, MoveState, MoveType


class StockMove(SQLModel, table=True):
    """The immutable ledger. Every inventory change is one row here.

    Balances are NEVER stored; they are summed from these rows:
        on_hand     = Σ(done IN qty)   − Σ(done OUT qty)
        reserved    = Σ(reserved OUT qty)
        free_to_use = on_hand − reserved
    """

    id: int | None = Field(default=None, primary_key=True)
    product_id: int = Field(foreign_key="product.id", index=True)
    qty: float
    move_type: MoveType
    state: MoveState = Field(default=MoveState.DRAFT, index=True)
    source: MoveSource
    source_doc_id: int | None = Field(default=None, index=True)
    note: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    done_at: datetime | None = None
