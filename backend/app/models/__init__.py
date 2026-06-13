"""Importing this package registers every table on SQLModel.metadata."""

from app.models.audit import AuditLog
from app.models.bom import BoM, BoMLine, BoMOperation
from app.models.enums import (
    MOState,
    MoveSource,
    MoveState,
    MoveType,
    PartnerType,
    ProcurementType,
    PurchaseOrderState,
    SaleOrderState,
    UserRole,
    WorkOrderState,
)
from app.models.manufacturing import ManufacturingOrder, WorkOrder
from app.models.partner import Partner
from app.models.product import Product
from app.models.purchase import PurchaseOrder, PurchaseOrderLine
from app.models.sales import SaleOrder, SaleOrderLine
from app.models.stock import StockMove
from app.models.user import User

__all__ = [
    "AuditLog",
    "BoM",
    "BoMLine",
    "BoMOperation",
    "ManufacturingOrder",
    "WorkOrder",
    "Partner",
    "Product",
    "PurchaseOrder",
    "PurchaseOrderLine",
    "SaleOrder",
    "SaleOrderLine",
    "StockMove",
    "User",
    "MOState",
    "MoveSource",
    "MoveState",
    "MoveType",
    "PartnerType",
    "ProcurementType",
    "PurchaseOrderState",
    "SaleOrderState",
    "UserRole",
    "WorkOrderState",
]
