"""Importing this package registers every table on SQLModel.metadata."""

from app.models.access import UserModuleAccess
from app.models.audit import AuditLog
from app.models.bom import BoM, BoMLine, BoMOperation
from app.models.company import Company
from app.models.enums import (
    ACCESS_RANK,
    AccessLevel,
    MOState,
    ModuleName,
    MoveSource,
    MoveState,
    MoveType,
    PartnerType,
    ProcurementType,
    PurchaseOrderState,
    ReturnState,
    SaleOrderState,
    WorkOrderState,
)
from app.models.manufacturing import ManufacturingOrder, WorkOrder
from app.models.partner import Partner
from app.models.product import Product
from app.models.purchase import PurchaseOrder, PurchaseOrderLine
from app.models.returns import CustomerReturn, CustomerReturnLine
from app.models.sales import SaleOrder, SaleOrderLine
from app.models.signup_request import SignupRequest
from app.models.stock import StockMove
from app.models.user import User

__all__ = [
    "AuditLog",
    "BoM",
    "BoMLine",
    "BoMOperation",
    "Company",
    "CustomerReturn",
    "CustomerReturnLine",
    "ManufacturingOrder",
    "WorkOrder",
    "Partner",
    "Product",
    "PurchaseOrder",
    "PurchaseOrderLine",
    "SaleOrder",
    "SaleOrderLine",
    "SignupRequest",
    "StockMove",
    "User",
    "UserModuleAccess",
    "ACCESS_RANK",
    "AccessLevel",
    "ModuleName",
    "MOState",
    "MoveSource",
    "MoveState",
    "MoveType",
    "PartnerType",
    "ProcurementType",
    "PurchaseOrderState",
    "ReturnState",
    "SaleOrderState",
    "WorkOrderState",
]
