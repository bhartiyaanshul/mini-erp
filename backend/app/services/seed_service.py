from sqlmodel import Session, delete, select

from app.models import (
    AuditLog,
    BoM,
    BoMLine,
    BoMOperation,
    ManufacturingOrder,
    Partner,
    Product,
    PurchaseOrder,
    PurchaseOrderLine,
    SaleOrder,
    SaleOrderLine,
    StockMove,
    User,
    WorkOrder,
)
from app.models.enums import MoveSource, MoveState, MoveType, PartnerType, ProcurementType, UserRole
from app.core.security import hash_password
from app.services import inventory_service

DEMO_PASSWORD = "demo1234"

DEMO_USERS = [
    ("admin@shivfurniture.com", "Aarav Admin", UserRole.ADMIN),
    ("sales@shivfurniture.com", "Sara Sales", UserRole.SALES),
    ("purchase@shivfurniture.com", "Priya Purchase", UserRole.PURCHASE),
    ("mfg@shivfurniture.com", "Manish Manufacturing", UserRole.MANUFACTURING),
    ("inventory@shivfurniture.com", "Ishan Inventory", UserRole.INVENTORY),
    ("owner@shivfurniture.com", "Omkar Owner", UserRole.OWNER),
]


def ensure_default_users(session: Session) -> None:
    """Create the six role users if they don't exist (idempotent)."""
    for email, name, role in DEMO_USERS:
        existing = session.exec(select(User).where(User.email == email)).first()
        if not existing:
            session.add(
                User(
                    email=email,
                    full_name=name,
                    hashed_password=hash_password(DEMO_PASSWORD),
                    role=role,
                )
            )
    session.commit()


def _clear_business_data(session: Session) -> None:
    # Preserve Users so the logged-in admin's session stays valid.
    for model in (
        StockMove,
        SaleOrderLine,
        SaleOrder,
        PurchaseOrderLine,
        PurchaseOrder,
        WorkOrder,
        ManufacturingOrder,
        BoMLine,
        BoMOperation,
        BoM,
        Product,
        Partner,
        AuditLog,
    ):
        session.exec(delete(model))
    session.commit()


def _adjust(session: Session, product_id: int, qty: float) -> None:
    if qty <= 0:
        return
    inventory_service.create_move(
        session,
        product_id=product_id,
        qty=qty,
        move_type=MoveType.IN,
        source=MoveSource.ADJUSTMENT,
        state=MoveState.DONE,
        note="Opening stock (demo seed)",
    )


def run_demo_seed(session: Session) -> dict:
    """One-click 'Shiv Furniture Works' scenario, teed up for the demo.

    - Wooden Table (MANUFACTURE): 5 on hand. Order 20 -> reserve 5, MO for 15.
    - Office Chair (BUY): 10 on hand. Order 25 -> reserve 10, PO for 15.
    - Raw components stocked deep enough to complete the MO live.
    """
    ensure_default_users(session)
    _clear_business_data(session)

    # --- Partners ---------------------------------------------------------
    timber = Partner(name="Timber Traders", type=PartnerType.VENDOR, email="sales@timber.example", phone="900000001")
    hardware = Partner(name="FastFix Hardware", type=PartnerType.VENDOR, email="orders@fastfix.example", phone="900000002")
    chairco = Partner(name="ChairWorks Supply", type=PartnerType.VENDOR, email="hello@chairworks.example", phone="900000003")
    retail = Partner(name="Retail Mart", type=PartnerType.CUSTOMER, email="buy@retailmart.example", phone="900000010")
    office = Partner(name="Office Spaces Ltd", type=PartnerType.CUSTOMER, email="po@officespaces.example", phone="900000011")
    session.add_all([timber, hardware, chairco, retail, office])
    session.flush()

    # --- Component products (bought) -------------------------------------
    legs = Product(name="Wooden Legs", sku="CMP-LEG", sales_price=80, cost_price=50, uom="Units",
                   procure_on_demand=True, procurement_type=ProcurementType.BUY, default_vendor_id=timber.id)
    top = Product(name="Wooden Top", sku="CMP-TOP", sales_price=600, cost_price=400, uom="Units",
                  procure_on_demand=True, procurement_type=ProcurementType.BUY, default_vendor_id=timber.id)
    screws = Product(name="Screws", sku="CMP-SCR", sales_price=3, cost_price=2, uom="Units",
                     procure_on_demand=True, procurement_type=ProcurementType.BUY, default_vendor_id=hardware.id)
    session.add_all([legs, top, screws])
    session.flush()

    # --- Finished products -----------------------------------------------
    table = Product(name="Wooden Table", sku="FG-TABLE", sales_price=3000, cost_price=1800, uom="Units",
                    procure_on_demand=True, procurement_type=ProcurementType.MANUFACTURE)
    chair = Product(name="Office Chair", sku="FG-CHAIR", sales_price=1500, cost_price=900, uom="Units",
                    procure_on_demand=True, procurement_type=ProcurementType.BUY, default_vendor_id=chairco.id)
    session.add_all([table, chair])
    session.flush()

    # --- BoM for Wooden Table (the brief's canonical example) ------------
    bom = BoM(name="Wooden Table BoM", product_id=table.id)
    session.add(bom)
    session.flush()
    session.add_all([
        BoMLine(bom_id=bom.id, component_product_id=legs.id, qty=4),
        BoMLine(bom_id=bom.id, component_product_id=top.id, qty=1),
        BoMLine(bom_id=bom.id, component_product_id=screws.id, qty=12),
    ])
    session.add_all([
        BoMOperation(bom_id=bom.id, name="Assembly", duration_mins=60, work_center="Assembly Line", sequence=1),
        BoMOperation(bom_id=bom.id, name="Painting", duration_mins=30, work_center="Paint Floor", sequence=2),
        BoMOperation(bom_id=bom.id, name="Packing", duration_mins=20, work_center="Packaging Unit", sequence=3),
    ])
    table.bom_id = bom.id
    session.add(table)
    session.flush()

    # --- Opening stock ----------------------------------------------------
    _adjust(session, legs.id, 80)     # enough to build 15+ tables (15*4=60)
    _adjust(session, top.id, 30)      # 15*1 = 15
    _adjust(session, screws.id, 300)  # 15*12 = 180
    _adjust(session, table.id, 5)     # MTS buffer; large order triggers MTO
    _adjust(session, chair.id, 10)    # large chair order triggers a PO

    session.commit()

    return {
        "message": "Demo scenario loaded: Shiv Furniture Works",
        "login_password": DEMO_PASSWORD,
        "users": [{"email": e, "role": r.value} for e, _, r in DEMO_USERS],
        "hint": {
            "mts": "Sell 3 Wooden Tables → delivers from stock (5 on hand).",
            "mto_manufacture": "Sell 20 Wooden Tables → reserves 5, auto-creates an MO for 15.",
            "mto_buy": "Sell 25 Office Chairs → reserves 10, auto-creates a PO for 15.",
        },
    }
