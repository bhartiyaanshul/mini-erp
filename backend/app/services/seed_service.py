import math
from datetime import datetime, timedelta

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


HISTORY_DAYS = 35  # how far back the seeded demand history runs


def _daily_demand(base: float, day_index: int) -> int:
    """Deterministic per-day demand: a gentle weekly wave + slight upward drift.

    No randomness, so the seed, and therefore the forecast computed from it,
    is fully reproducible. The drift gives a mild rising trend, which makes
    the projected stockouts believable for the demo.
    """
    wave = 1.0 + 0.30 * math.sin(day_index / 7.0 * 2.0 * math.pi)
    drift = 1.0 + 0.010 * day_index
    return max(0, round(base * wave * drift))


def _seed_history(
    session: Session,
    product_id: int,
    *,
    base_per_day: float,
    current_on_hand: float,
    source: MoveSource,
    note: str,
) -> None:
    """Backfill ~HISTORY_DAYS of dated demand, netting to `current_on_hand`.

    Posts one dated opening receipt (sized = on-hand + everything later sold)
    followed by a deterministic series of dated DONE OUT moves. The ledger ends
    at exactly `current_on_hand`, so the demo script's invariants hold, but now
    there's real consumption history for the forecast to learn from.
    """
    start = datetime.utcnow() - timedelta(days=HISTORY_DAYS)
    daily = [_daily_demand(base_per_day, i) for i in range(HISTORY_DAYS)]
    total_out = sum(daily)

    inventory_service.create_move(
        session,
        product_id=product_id,
        qty=float(current_on_hand + total_out),
        move_type=MoveType.IN,
        source=MoveSource.ADJUSTMENT,
        state=MoveState.DONE,
        done_at=start,
        note="Opening stock (demo seed)",
    )
    for i, q in enumerate(daily):
        if q <= 0:
            continue
        inventory_service.create_move(
            session,
            product_id=product_id,
            qty=float(q),
            move_type=MoveType.OUT,
            source=source,
            state=MoveState.DONE,
            done_at=start + timedelta(days=i + 1),
            note=note,
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

    # --- Opening stock + dated demand history -----------------------------
    # Each call backfills ~35 days of consumption but nets to the same on-hand
    # the demo script relies on (5 tables, 10 chairs, components deep), so the
    # forecast has real signal while every existing flow still works.
    # Finished goods are sold; components are consumed building tables
    # (~4 legs / 1 top / 12 screws per table).
    _seed_history(session, table.id, base_per_day=1.6, current_on_hand=5,
                  source=MoveSource.SALE, note="Sold (demo history)")
    _seed_history(session, chair.id, base_per_day=2.2, current_on_hand=10,
                  source=MoveSource.SALE, note="Sold (demo history)")
    _seed_history(session, legs.id, base_per_day=8, current_on_hand=80,
                  source=MoveSource.MANUFACTURING_CONSUME, note="Consumed in assembly (demo history)")
    _seed_history(session, top.id, base_per_day=1.9, current_on_hand=30,
                  source=MoveSource.MANUFACTURING_CONSUME, note="Consumed in assembly (demo history)")
    _seed_history(session, screws.id, base_per_day=20, current_on_hand=300,
                  source=MoveSource.MANUFACTURING_CONSUME, note="Consumed in assembly (demo history)")

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
