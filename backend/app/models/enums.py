from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    SALES = "sales"
    PURCHASE = "purchase"
    MANUFACTURING = "manufacturing"
    INVENTORY = "inventory"
    OWNER = "owner"


class PartnerType(str, Enum):
    CUSTOMER = "customer"
    VENDOR = "vendor"
    BOTH = "both"


class ProcurementType(str, Enum):
    BUY = "buy"
    MANUFACTURE = "manufacture"


class MoveState(str, Enum):
    DRAFT = "draft"
    RESERVED = "reserved"
    DONE = "done"


class MoveType(str, Enum):
    IN = "in"
    OUT = "out"


class MoveSource(str, Enum):
    SALE = "sale"
    PURCHASE = "purchase"
    MANUFACTURING_CONSUME = "manufacturing_consume"
    MANUFACTURING_PRODUCE = "manufacturing_produce"
    ADJUSTMENT = "adjustment"


class SaleOrderState(str, Enum):
    DRAFT = "draft"
    CONFIRMED = "confirmed"
    PARTIALLY_DELIVERED = "partially_delivered"
    FULLY_DELIVERED = "fully_delivered"
    CANCELLED = "cancelled"


class PurchaseOrderState(str, Enum):
    DRAFT = "draft"
    CONFIRMED = "confirmed"
    PARTIALLY_RECEIVED = "partially_received"
    FULLY_RECEIVED = "fully_received"
    CANCELLED = "cancelled"


class MOState(str, Enum):
    DRAFT = "draft"
    CONFIRMED = "confirmed"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    CANCELLED = "cancelled"


class WorkOrderState(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    DONE = "done"
