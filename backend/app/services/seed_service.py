import math
from datetime import datetime, timedelta

from sqlmodel import Session, delete, select

from app.models import (
    AuditLog,
    BoM,
    BoMLine,
    BoMOperation,
    Company,
    ManufacturingOrder,
    Partner,
    Product,
    PurchaseOrder,
    PurchaseOrderLine,
    SaleOrder,
    SaleOrderLine,
    StockMove,
    User,
    UserModuleAccess,
    WorkOrder,
)
from app.models.enums import (
    AccessLevel,
    ModuleName,
    MoveSource,
    MoveState,
    MoveType,
    PartnerType,
    ProcurementType,
)
from app.core.security import hash_password
from app.services import inventory_service

DEMO_PASSWORD = "demo1234"
DEFAULT_COMPANY_ID = 1
DEFAULT_COMPANY_NAME = "Shiv Furniture Works"

_A = AccessLevel.ADMIN
_U = AccessLevel.USER

# (email, full_name, username, is_system_admin, {module: level})
DEMO_USERS = [
    ("admin@shivfurniture.com", "Aarav Admin", "shivadmin", True, {}),
    ("owner@shivfurniture.com", "Omkar Owner", "shivowner", True, {}),
    ("sales@shivfurniture.com", "Sara Sales", "shivsales", False,
     {ModuleName.SALES: _A, ModuleName.PRODUCT: _U}),
    ("purchase@shivfurniture.com", "Priya Purchase", "shivbuyer", False,
     {ModuleName.PURCHASE: _A, ModuleName.PRODUCT: _U}),
    ("mfg@shivfurniture.com", "Manish Manufacturing", "shivmfg1", False,
     {ModuleName.MANUFACTURING: _A, ModuleName.PRODUCT: _U}),
    ("inventory@shivfurniture.com", "Ishan Inventory", "shivstock", False,
     {ModuleName.PRODUCT: _A}),
]


def ensure_default_company(session: Session) -> Company:
    """Get-or-create the default tenant (id 1), so backfilled data has a home."""
    company = session.get(Company, DEFAULT_COMPANY_ID)
    if not company:
        company = Company(id=DEFAULT_COMPANY_ID, name=DEFAULT_COMPANY_NAME)
        session.add(company)
        session.commit()
        session.refresh(company)
    return company


def ensure_default_users(session: Session) -> None:
    """Create the demo users in the default company if absent (idempotent)."""
    ensure_default_company(session)
    for email, name, username, is_admin, access in DEMO_USERS:
        existing = session.exec(select(User).where(User.email == email)).first()
        if existing:
            continue
        user = User(
            email=email,
            username=username,
            full_name=name,
            hashed_password=hash_password(DEMO_PASSWORD),
            company_id=DEFAULT_COMPANY_ID,
            is_system_admin=is_admin,
        )
        session.add(user)
        session.flush()
        for module, level in access.items():
            session.add(UserModuleAccess(user_id=user.id, module=module, level=level))
    session.commit()


def _clear_business_data(session: Session, company_id: int) -> None:
    # Scoped to one company; preserve Users so the logged-in admin stays valid.
    # Child rows (lines, work orders) are removed by clearing parents first.
    so_ids = [r.id for r in session.exec(select(SaleOrder).where(SaleOrder.company_id == company_id)).all()]
    po_ids = [r.id for r in session.exec(select(PurchaseOrder).where(PurchaseOrder.company_id == company_id)).all()]
    mo_ids = [r.id for r in session.exec(select(ManufacturingOrder).where(ManufacturingOrder.company_id == company_id)).all()]
    bom_ids = [r.id for r in session.exec(select(BoM).where(BoM.company_id == company_id)).all()]
    if so_ids:
        session.exec(delete(SaleOrderLine).where(SaleOrderLine.sale_order_id.in_(so_ids)))
    if po_ids:
        session.exec(delete(PurchaseOrderLine).where(PurchaseOrderLine.purchase_order_id.in_(po_ids)))
    if mo_ids:
        session.exec(delete(WorkOrder).where(WorkOrder.mo_id.in_(mo_ids)))
    if bom_ids:
        session.exec(delete(BoMLine).where(BoMLine.bom_id.in_(bom_ids)))
        session.exec(delete(BoMOperation).where(BoMOperation.bom_id.in_(bom_ids)))
    for model in (StockMove, SaleOrder, PurchaseOrder, ManufacturingOrder, BoM, Product, Partner, AuditLog):
        session.exec(delete(model).where(model.company_id == company_id))
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
    company_id: int,
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
        company_id=company_id,
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
            company_id=company_id,
            product_id=product_id,
            qty=float(q),
            move_type=MoveType.OUT,
            source=source,
            state=MoveState.DONE,
            done_at=start + timedelta(days=i + 1),
            note=note,
        )


def run_demo_seed(session: Session, company_id: int = DEFAULT_COMPANY_ID) -> dict:
    """One-click 'Shiv Furniture Works' scenario, teed up for the demo.

    Scoped to one company — re-seeds only that tenant's data.
    - Wooden Table (MANUFACTURE): 5 on hand. Order 20 -> reserve 5, MO for 15.
    - Office Chair (BUY): 10 on hand. Order 25 -> reserve 10, PO for 15.
    - Raw components stocked deep enough to complete the MO live.
    """
    ensure_default_company(session)
    if company_id == DEFAULT_COMPANY_ID:
        ensure_default_users(session)
    _clear_business_data(session, company_id)

    # --- Partners ---------------------------------------------------------
    timber = Partner(company_id=company_id, name="Timber Traders", type=PartnerType.VENDOR, email="sales@timber.example", phone="900000001")
    hardware = Partner(company_id=company_id, name="FastFix Hardware", type=PartnerType.VENDOR, email="orders@fastfix.example", phone="900000002")
    chairco = Partner(company_id=company_id, name="ChairWorks Supply", type=PartnerType.VENDOR, email="hello@chairworks.example", phone="900000003")
    retail = Partner(company_id=company_id, name="Retail Mart", type=PartnerType.CUSTOMER, email="buy@retailmart.example", phone="900000010")
    office = Partner(company_id=company_id, name="Office Spaces Ltd", type=PartnerType.CUSTOMER, email="po@officespaces.example", phone="900000011")
    session.add_all([timber, hardware, chairco, retail, office])
    session.flush()

    # --- Component products (bought) -------------------------------------
    legs = Product(company_id=company_id, name="Wooden Legs", sku="CMP-LEG", sales_price=80, cost_price=50, uom="Units",
                   procure_on_demand=True, procurement_type=ProcurementType.BUY, default_vendor_id=timber.id)
    top = Product(company_id=company_id, name="Wooden Top", sku="CMP-TOP", sales_price=600, cost_price=400, uom="Units",
                  procure_on_demand=True, procurement_type=ProcurementType.BUY, default_vendor_id=timber.id)
    screws = Product(company_id=company_id, name="Screws", sku="CMP-SCR", sales_price=3, cost_price=2, uom="Units",
                     procure_on_demand=True, procurement_type=ProcurementType.BUY, default_vendor_id=hardware.id)
    session.add_all([legs, top, screws])
    session.flush()

    # --- Finished products -----------------------------------------------
    table = Product(company_id=company_id, name="Wooden Table", sku="FG-TABLE", sales_price=3000, cost_price=1800, uom="Units",
                    procure_on_demand=True, procurement_type=ProcurementType.MANUFACTURE)
    chair = Product(company_id=company_id, name="Office Chair", sku="FG-CHAIR", sales_price=1500, cost_price=900, uom="Units",
                    procure_on_demand=True, procurement_type=ProcurementType.BUY, default_vendor_id=chairco.id)
    session.add_all([table, chair])
    session.flush()

    # --- BoM for Wooden Table (the brief's canonical example) ------------
    bom = BoM(company_id=company_id, name="Wooden Table BoM", product_id=table.id)
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
    _seed_history(session, company_id, table.id, base_per_day=1.6, current_on_hand=5,
                  source=MoveSource.SALE, note="Sold (demo history)")
    _seed_history(session, company_id, chair.id, base_per_day=2.2, current_on_hand=10,
                  source=MoveSource.SALE, note="Sold (demo history)")
    _seed_history(session, company_id, legs.id, base_per_day=8, current_on_hand=80,
                  source=MoveSource.MANUFACTURING_CONSUME, note="Consumed in assembly (demo history)")
    _seed_history(session, company_id, top.id, base_per_day=1.9, current_on_hand=30,
                  source=MoveSource.MANUFACTURING_CONSUME, note="Consumed in assembly (demo history)")
    _seed_history(session, company_id, screws.id, base_per_day=20, current_on_hand=300,
                  source=MoveSource.MANUFACTURING_CONSUME, note="Consumed in assembly (demo history)")

    session.commit()

    return {
        "message": "Demo scenario loaded: Shiv Furniture Works",
        "login_password": DEMO_PASSWORD,
        "users": [
            {
                "email": email,
                "username": username,
                "kind": "System Administrator" if is_admin else "System User",
            }
            for email, _name, username, is_admin, _access in DEMO_USERS
        ],
        "hint": {
            "mts": "Sell 3 Wooden Tables → delivers from stock (5 on hand).",
            "mto_manufacture": "Sell 20 Wooden Tables → reserves 5, auto-creates an MO for 15.",
            "mto_buy": "Sell 25 Office Chairs → reserves 10, auto-creates a PO for 15.",
        },
    }
