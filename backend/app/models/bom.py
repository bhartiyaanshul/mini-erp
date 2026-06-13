from datetime import datetime

from sqlmodel import Field, Relationship, SQLModel


class BoM(SQLModel, table=True):
    """Bill of Materials: the recipe for a finished product."""

    id: int | None = Field(default=None, primary_key=True)
    name: str
    product_id: int = Field(foreign_key="product.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    lines: list["BoMLine"] = Relationship(
        back_populates="bom",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    operations: list["BoMOperation"] = Relationship(
        back_populates="bom",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class BoMLine(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    bom_id: int = Field(foreign_key="bom.id", index=True)
    component_product_id: int = Field(foreign_key="product.id")
    qty: float = 1.0

    bom: BoM | None = Relationship(back_populates="lines")


class BoMOperation(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    bom_id: int = Field(foreign_key="bom.id", index=True)
    name: str
    duration_mins: int = 0
    work_center: str = ""
    sequence: int = 1

    bom: BoM | None = Relationship(back_populates="operations")
