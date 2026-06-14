import random
from collections import defaultdict
from datetime import datetime, timedelta

from sqlmodel import Session, delete, func, select

from app.models import (
    AuditLog,
    BoM,
    BoMLine,
    BoMOperation,
    Company,
    CustomerReturn,
    CustomerReturnLine,
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
    MOState,
    ModuleName,
    MoveSource,
    MoveState,
    MoveType,
    PartnerType,
    ProcurementType,
    PurchaseOrderState,
    SaleOrderState,
    WorkOrderState,
)
from app.core.security import hash_password
from app.services import (
    inventory_service,
    manufacturing_service,
    purchase_service,
    returns_service,
    sales_service,
)

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
    ret_ids = [r.id for r in session.exec(select(CustomerReturn).where(CustomerReturn.company_id == company_id)).all()]
    if ret_ids:
        session.exec(delete(CustomerReturnLine).where(CustomerReturnLine.customer_return_id.in_(ret_ids)))
    if so_ids:
        session.exec(delete(SaleOrderLine).where(SaleOrderLine.sale_order_id.in_(so_ids)))
    if po_ids:
        session.exec(delete(PurchaseOrderLine).where(PurchaseOrderLine.purchase_order_id.in_(po_ids)))
    if mo_ids:
        session.exec(delete(WorkOrder).where(WorkOrder.mo_id.in_(mo_ids)))
    if bom_ids:
        session.exec(delete(BoMLine).where(BoMLine.bom_id.in_(bom_ids)))
        session.exec(delete(BoMOperation).where(BoMOperation.bom_id.in_(bom_ids)))
    for model in (CustomerReturn, StockMove, SaleOrder, PurchaseOrder, ManufacturingOrder, BoM, Product, Partner, AuditLog):
        session.exec(delete(model).where(model.company_id == company_id))
    session.commit()


# --------------------------------------------------------------------------- #
#  One month of operating history                                             #
# --------------------------------------------------------------------------- #
#
# The seed plays out ~31 days of real trading so the dashboard, Time Machine and
# forecast all light up from a single click. It works in two passes:
#
#   1. HISTORY  — dated, already-closed documents (fully delivered sale orders,
#      fully received purchase orders, completed manufacturing orders) plus their
#      ledger moves, stamped across the last month. This is what fills the money
#      KPIs, the sales/purchase trend, top-products and the valuation curve.
#   2. LIVE     — a handful of open orders created through the *real* services
#      (confirm / deliver / receive / procure) so reservations, shortages,
#      at-risk deliveries and the demand→delivery map are computed authentically,
#      exactly as they would be in day-to-day use.
#
SIM_DAYS = 31          # length of the seeded trading month
SEED = 20240614        # fixed RNG seed → the whole scenario is reproducible

# Monthly sales target (units) per finished good, and how it is replenished.
# Restock volume sits just above demand so stock trends sideways, not to zero.
_SALES_TARGET = {"table": 30, "shelf": 22, "chair": 44, "cabinet": 24, "desk": 16}


def run_demo_seed(session: Session, company_id: int = DEFAULT_COMPANY_ID) -> dict:
    """One-click 'Shiv Furniture Works' scenario with a full month of activity.

    Scoped to one company — re-seeds only that tenant's data. Loads a populated
    product catalog, ~31 days of closed sales/purchase/manufacturing documents,
    and a set of live in-flight orders (healthy, at-risk-make, at-risk-buy,
    partially delivered) plus customer returns, so every module and the whole
    dashboard render filled with believable, ledger-consistent numbers.
    """
    ensure_default_company(session)
    if company_id == DEFAULT_COMPANY_ID:
        ensure_default_users(session)
    _clear_business_data(session, company_id)

    rng = random.Random(SEED)
    now = datetime.utcnow()
    anchor = datetime(now.year, now.month, now.day)  # midnight today

    def at(days_ago: int, hour: int = 9, minute: int = 0) -> datetime:
        return anchor - timedelta(days=days_ago) + timedelta(hours=hour, minutes=minute)

    # ---- Partners -------------------------------------------------------- #
    timber = Partner(company_id=company_id, name="Timber Traders", type=PartnerType.VENDOR, email="sales@timber.example", phone="900000001")
    fastfix = Partner(company_id=company_id, name="FastFix Hardware", type=PartnerType.VENDOR, email="orders@fastfix.example", phone="900000002")
    chairco = Partner(company_id=company_id, name="ChairWorks Supply", type=PartnerType.VENDOR, email="hello@chairworks.example", phone="900000003")
    ergodesk = Partner(company_id=company_id, name="ErgoDesk Supply", type=PartnerType.VENDOR, email="sales@ergodesk.example", phone="900000004")
    retail = Partner(company_id=company_id, name="Retail Mart", type=PartnerType.CUSTOMER, email="buy@retailmart.example", phone="900000010")
    office = Partner(company_id=company_id, name="Office Spaces Ltd", type=PartnerType.CUSTOMER, email="po@officespaces.example", phone="900000011")
    urban = Partner(company_id=company_id, name="Urban Living Co", type=PartnerType.CUSTOMER, email="orders@urbanliving.example", phone="900000012")
    campus = Partner(company_id=company_id, name="Campus Furnishers", type=PartnerType.CUSTOMER, email="procure@campusfurnish.example", phone="900000013")
    metro = Partner(company_id=company_id, name="Metro Interiors", type=PartnerType.CUSTOMER, email="buy@metrointeriors.example", phone="900000014")
    session.add_all([timber, fastfix, chairco, ergodesk, retail, office, urban, campus, metro])
    session.flush()
    customers = [retail, office, urban, campus, metro]

    # ---- Component products (bought) ------------------------------------ #
    legs = Product(company_id=company_id, name="Wooden Legs", sku="CMP-LEG", sales_price=80, cost_price=50, uom="Units",
                   procure_on_demand=True, procurement_type=ProcurementType.BUY, default_vendor_id=timber.id)
    top = Product(company_id=company_id, name="Wooden Top", sku="CMP-TOP", sales_price=600, cost_price=400, uom="Units",
                  procure_on_demand=True, procurement_type=ProcurementType.BUY, default_vendor_id=timber.id)
    screws = Product(company_id=company_id, name="Screws (box)", sku="CMP-SCR", sales_price=3, cost_price=2, uom="Units",
                     procure_on_demand=True, procurement_type=ProcurementType.BUY, default_vendor_id=fastfix.id)
    plank = Product(company_id=company_id, name="Shelf Plank", sku="CMP-PLK", sales_price=180, cost_price=120, uom="Units",
                    procure_on_demand=True, procurement_type=ProcurementType.BUY, default_vendor_id=timber.id)
    bracket = Product(company_id=company_id, name="Metal Bracket", sku="CMP-BRK", sales_price=60, cost_price=35, uom="Units",
                      procure_on_demand=True, procurement_type=ProcurementType.BUY, default_vendor_id=fastfix.id)
    session.add_all([legs, top, screws, plank, bracket])
    session.flush()

    # ---- Finished products ---------------------------------------------- #
    table = Product(company_id=company_id, name="Wooden Table", sku="FG-TABLE", sales_price=3000, cost_price=1800, uom="Units",
                    procure_on_demand=True, procurement_type=ProcurementType.MANUFACTURE)
    shelf = Product(company_id=company_id, name="Bookshelf", sku="FG-SHELF", sales_price=4500, cost_price=2600, uom="Units",
                    procure_on_demand=True, procurement_type=ProcurementType.MANUFACTURE)
    chair = Product(company_id=company_id, name="Office Chair", sku="FG-CHAIR", sales_price=1500, cost_price=900, uom="Units",
                    procure_on_demand=True, procurement_type=ProcurementType.BUY, default_vendor_id=chairco.id)
    cabinet = Product(company_id=company_id, name="Filing Cabinet", sku="FG-CAB", sales_price=3800, cost_price=2400, uom="Units",
                      procure_on_demand=True, procurement_type=ProcurementType.BUY, default_vendor_id=chairco.id)
    desk = Product(company_id=company_id, name="Standing Desk", sku="FG-DESK", sales_price=5200, cost_price=3100, uom="Units",
                   procure_on_demand=True, procurement_type=ProcurementType.BUY, default_vendor_id=ergodesk.id)
    session.add_all([table, shelf, chair, cabinet, desk])
    session.flush()

    # ---- BoMs ------------------------------------------------------------ #
    table_bom = BoM(company_id=company_id, name="Wooden Table BoM", product_id=table.id)
    shelf_bom = BoM(company_id=company_id, name="Bookshelf BoM", product_id=shelf.id)
    session.add_all([table_bom, shelf_bom])
    session.flush()
    session.add_all([
        BoMLine(bom_id=table_bom.id, component_product_id=legs.id, qty=4),
        BoMLine(bom_id=table_bom.id, component_product_id=top.id, qty=1),
        BoMLine(bom_id=table_bom.id, component_product_id=screws.id, qty=12),
        BoMLine(bom_id=shelf_bom.id, component_product_id=plank.id, qty=6),
        BoMLine(bom_id=shelf_bom.id, component_product_id=bracket.id, qty=8),
        BoMLine(bom_id=shelf_bom.id, component_product_id=screws.id, qty=24),
    ])
    session.add_all([
        BoMOperation(bom_id=table_bom.id, name="Assembly", duration_mins=60, work_center="Assembly Line", sequence=1),
        BoMOperation(bom_id=table_bom.id, name="Painting", duration_mins=30, work_center="Paint Floor", sequence=2),
        BoMOperation(bom_id=table_bom.id, name="Packing", duration_mins=20, work_center="Packaging Unit", sequence=3),
        BoMOperation(bom_id=shelf_bom.id, name="Cutting", duration_mins=45, work_center="Cutting Bay", sequence=1),
        BoMOperation(bom_id=shelf_bom.id, name="Assembly", duration_mins=50, work_center="Assembly Line", sequence=2),
        BoMOperation(bom_id=shelf_bom.id, name="Finishing", duration_mins=30, work_center="Paint Floor", sequence=3),
    ])
    table.bom_id = table_bom.id
    shelf.bom_id = shelf_bom.id
    session.add_all([table, shelf])
    session.flush()

    # ----------------------------------------------------------------- #
    #  Ledger / document helpers — all flush-only, one commit at the end #
    # ----------------------------------------------------------------- #
    on_hand: dict[int, float] = defaultdict(float)

    def seq(model, prefix: str) -> str:
        count = session.exec(
            select(func.count()).select_from(model).where(model.company_id == company_id)
        ).one()
        return f"{prefix}-{(count or 0) + 1:04d}"

    def ev(entity_type: str, action: str, description: str, when: datetime, entity_id: int | None = None) -> None:
        session.add(AuditLog(
            company_id=company_id, entity_type=entity_type, entity_id=entity_id,
            action=action, description=description, user_id=None, payload={}, created_at=when,
        ))

    def move_in(product: Product, qty: float, source: MoveSource, when: datetime, note: str) -> None:
        inventory_service.create_move(
            session, company_id=company_id, product_id=product.id, qty=qty,
            move_type=MoveType.IN, source=source, state=MoveState.DONE, done_at=when, note=note,
        )
        on_hand[product.id] += qty

    def move_out(product: Product, qty: float, source: MoveSource, when: datetime, note: str) -> None:
        inventory_service.create_move(
            session, company_id=company_id, product_id=product.id, qty=qty,
            move_type=MoveType.OUT, source=source, state=MoveState.DONE, done_at=when, note=note,
        )
        on_hand[product.id] -= qty

    def open_stock(product: Product, qty: float) -> None:
        when = at(SIM_DAYS + 1, 8)
        move_in(product, qty, MoveSource.ADJUSTMENT, when, "Opening stock (demo seed)")

    def completed_purchase(vendor: Partner, product: Product, qty: float, days_ago: int) -> PurchaseOrder:
        created = at(days_ago, 9)
        received = at(max(0, days_ago - 2), 11)  # lands a couple of days later
        po = PurchaseOrder(
            company_id=company_id, name=seq(PurchaseOrder, "PO"), partner_id=vendor.id,
            state=PurchaseOrderState.FULLY_RECEIVED, order_date=created, created_at=created,
            expected_receipt_date=received,
        )
        session.add(po)
        session.flush()
        session.add(PurchaseOrderLine(
            purchase_order_id=po.id, product_id=product.id, qty=qty,
            qty_received=qty, unit_price=product.cost_price,
        ))
        move_in(product, qty, MoveSource.PURCHASE, received, f"Received via {po.name}")
        ev("purchase_order", "created", f"{po.name} created for {vendor.name}", created, po.id)
        ev("purchase_order", "received", f"{po.name} fully received", received, po.id)
        return po

    def completed_manufacture(product: Product, bom: BoM, qty: float, days_ago: int) -> ManufacturingOrder:
        created = at(days_ago, 8)
        finished = at(max(0, days_ago - 2), 12)
        mo = ManufacturingOrder(
            company_id=company_id, name=seq(ManufacturingOrder, "MO"), product_id=product.id,
            bom_id=bom.id, qty=qty, state=MOState.DONE, planned_start=created,
            planned_finish=finished, created_at=created,
        )
        session.add(mo)
        session.flush()
        bom_lines = session.exec(select(BoMLine).where(BoMLine.bom_id == bom.id)).all()
        for bl in bom_lines:
            component = session.get(Product, bl.component_product_id)
            move_out(component, bl.qty * qty, MoveSource.MANUFACTURING_CONSUME, at(days_ago, 8, 30),
                     f"Consumed for {mo.name}")
        ops = session.exec(select(BoMOperation).where(BoMOperation.bom_id == bom.id).order_by(BoMOperation.sequence)).all()
        for op in ops:
            session.add(WorkOrder(mo_id=mo.id, operation_name=op.name, duration_mins=op.duration_mins,
                                  work_center=op.work_center, sequence=op.sequence, state=WorkOrderState.DONE))
        move_in(product, qty, MoveSource.MANUFACTURING_PRODUCE, finished, f"Produced by {mo.name}")
        ev("manufacturing_order", "created", f"{mo.name} created for {qty:g} x {product.name}", created, mo.id)
        ev("manufacturing_order", "completed", f"{mo.name} completed — produced {qty:g} x {product.name}", finished, mo.id)
        return mo

    def completed_sale(customer: Partner, lines: list[tuple[Product, int]], days_ago: int) -> SaleOrder:
        created = at(days_ago, 10)
        delivered = at(days_ago, 15)
        so = SaleOrder(
            company_id=company_id, name=seq(SaleOrder, "SO"), partner_id=customer.id,
            state=SaleOrderState.FULLY_DELIVERED, order_date=created, created_at=created,
            promise_date=at(max(0, days_ago - 3), 12),
        )
        session.add(so)
        session.flush()
        for product, qty in lines:
            session.add(SaleOrderLine(
                sale_order_id=so.id, product_id=product.id, qty=qty,
                qty_reserved=qty, qty_delivered=qty, unit_price=product.sales_price,
            ))
            move_out(product, qty, MoveSource.SALE, delivered, f"Delivered for {so.name}")
        ev("sale_order", "created", f"{so.name} created for {customer.name}", created, so.id)
        ev("sale_order", "confirmed", f"{so.name} confirmed", at(days_ago, 10, 10), so.id)
        ev("sale_order", "delivered", f"{so.name} fully delivered", delivered, so.id)
        return so

    # ---- Opening stock (deep enough that the ledger never dips below 0, and
    # that a 15-unit table MO can reserve its components without procuring) -- #
    open_stock(legs, 320)
    open_stock(top, 80)
    open_stock(screws, 1200)
    open_stock(plank, 240)
    open_stock(bracket, 280)
    open_stock(table, 16)
    open_stock(shelf, 12)
    open_stock(chair, 26)
    open_stock(cabinet, 14)
    open_stock(desk, 10)

    # ---- Replenishment + demand, day by day ----------------------------- #
    sellable = [table, shelf, chair, cabinet, desk]
    daily_rate = {p.name: _SALES_TARGET[key] / SIM_DAYS
                  for p, key in [(table, "table"), (shelf, "shelf"), (chair, "chair"),
                                 (cabinet, "cabinet"), (desk, "desk")]}
    hist_sos: list[SaleOrder] = []

    for d in range(SIM_DAYS, 0, -1):
        elapsed = SIM_DAYS - d  # 0,1,2,... going forward in time

        # Production runs (manufactured goods) — keep finished stock topped up.
        if elapsed % 5 == 1:
            completed_manufacture(table, table_bom, 6, d)
        if elapsed % 6 == 3:
            completed_manufacture(shelf, shelf_bom, 5, d)

        # Purchase receipts (bought goods + periodic component restocks).
        if elapsed % 5 == 0:
            completed_purchase(chairco, chair, 9, d)
            completed_purchase(chairco, cabinet, 6, d)
        if elapsed % 7 == 2:
            completed_purchase(ergodesk, desk, 5, d)
        if elapsed % 8 == 4:
            completed_purchase(timber, legs, 80, d)
            completed_purchase(timber, top, 24, d)
            completed_purchase(fastfix, screws, 300, d)

        # Demand: assemble the day's per-product sales, then split into 1–2 SOs.
        todays: list[tuple[Product, int]] = []
        for p in sellable:
            rate = daily_rate[p.name]
            qty = max(0, round(rng.gauss(rate, rate * 0.8)))
            qty = min(qty, int(on_hand[p.id]))
            if qty > 0:
                todays.append((p, qty))
        if not todays:
            continue
        rng.shuffle(todays)
        # Most days one multi-line order; busier days split across two customers.
        if len(todays) >= 3 and rng.random() < 0.6:
            mid = len(todays) // 2
            buckets = [todays[:mid], todays[mid:]]
        else:
            buckets = [todays]
        picked_customers = rng.sample(customers, len(buckets))
        for cust, bucket in zip(picked_customers, buckets):
            hist_sos.append(completed_sale(cust, bucket, d))

    session.commit()

    # ----------------------------------------------------------------- #
    #  Live, in-flight orders — driven through the real services so      #
    #  reservations, shortages, at-risk and orchestration are authentic. #
    # ----------------------------------------------------------------- #
    def new_so(customer: Partner, product: Product, qty: float, *, promise_days: int = 4) -> SaleOrder:
        so = SaleOrder(
            company_id=company_id, name=seq(SaleOrder, "SO"), partner_id=customer.id,
            promise_date=now + timedelta(days=promise_days),
        )
        session.add(so)
        session.flush()
        session.add(SaleOrderLine(sale_order_id=so.id, product_id=product.id, qty=qty, unit_price=product.sales_price))
        ev("sale_order", "created", f"{so.name} created for {customer.name}", now, so.id)
        session.commit()
        session.refresh(so)
        return so

    avail = inventory_service.availability_map(session, [p.id for p in sellable])

    # 1) Healthy order — fully reserved from stock, awaiting delivery.
    healthy_p = max([shelf, cabinet, desk], key=lambda p: avail[p.id]["free_to_use"])
    healthy_qty = max(2, int(avail[healthy_p.id]["free_to_use"] * 0.4))
    healthy_so = new_so(retail, healthy_p, healthy_qty)
    sales_service.confirm_order(session, healthy_so)

    # 2) At-risk (make) — order beyond stock so procurement spins up an MO.
    # Components are deliberately deep enough that the MO reserves them in full,
    # so this order's only blocker is production (not a vendor receipt).
    free_table = avail[table.id]["free_to_use"]
    table_so = new_so(office, table, free_table + 15, promise_days=5)
    sales_service.confirm_order(session, table_so)
    # Push the auto-created MO into production for pipeline variety.
    table_mo = session.exec(
        select(ManufacturingOrder).where(
            ManufacturingOrder.company_id == company_id,
            ManufacturingOrder.origin == table_so.name,
            ManufacturingOrder.state == MOState.CONFIRMED,
        )
    ).first()
    if table_mo and table_mo.work_orders:
        manufacturing_service.start_work_order(session, sorted(table_mo.work_orders, key=lambda w: w.sequence)[0])

    # 3) At-risk (buy) + partial delivery — ship what's reserved, PO covers rest.
    free_chair = avail[chair.id]["free_to_use"]
    chair_so = new_so(metro, chair, free_chair + 12, promise_days=3)
    sales_service.confirm_order(session, chair_so)
    if free_chair >= 1:
        sales_service.deliver_order(session, chair_so)  # partially delivered

    # 4) A standalone confirmed MO (queued production) for pipeline depth.
    manufacturing_service.create_mo(
        session, company_id=company_id, product_id=shelf.id, qty=4, auto_confirm=True, commit=True
    )

    # 5) Standalone purchase orders — one fully open, one partially received.
    purchase_service.create_po(
        session, company_id=company_id, vendor_id=timber.id,
        line_items=[{"product_id": top.id, "qty": 20}], auto_confirm=True, commit=True,
    )
    part_po = purchase_service.create_po(
        session, company_id=company_id, vendor_id=fastfix.id,
        line_items=[{"product_id": screws.id, "qty": 600}], auto_confirm=True, commit=True,
    )
    purchase_service.receive_order(session, part_po, receive_lines={part_po.lines[0].id: 250})

    # 6) A draft and a cancelled order so the pipeline shows every state.
    new_so(urban, desk, 2)  # left in draft
    cancel_so = new_so(campus, cabinet, 3)
    sales_service.cancel_order(session, cancel_so)

    # ---- Customer returns — one processed, one waiting in draft ---------- #
    def returnable_line(so: SaleOrder) -> SaleOrderLine | None:
        return next((ln for ln in so.lines if ln.qty_delivered >= 2), None)

    processed_return = pending_return = None
    candidates = [so for so in hist_sos if returnable_line(so)]
    if candidates:
        src = candidates[len(candidates) // 3]
        ln = returnable_line(src)
        ret = CustomerReturn(
            company_id=company_id, name=seq(CustomerReturn, "RMA"), sale_order_id=src.id,
            partner_id=src.partner_id, reason="Damaged in transit",
        )
        session.add(ret)
        session.flush()
        session.add(CustomerReturnLine(
            customer_return_id=ret.id, sale_order_line_id=ln.id, product_id=ln.product_id,
            qty=min(2, ln.qty_delivered), qty_scrap=1, unit_price=ln.unit_price,
        ))
        session.commit()
        returns_service.process_return(session, ret)
        processed_return = ret.name
    if len(candidates) > 1:
        src = candidates[-1]
        ln = returnable_line(src)
        ret = CustomerReturn(
            company_id=company_id, name=seq(CustomerReturn, "RMA"), sale_order_id=src.id,
            partner_id=src.partner_id, reason="Customer changed mind",
        )
        session.add(ret)
        session.flush()
        session.add(CustomerReturnLine(
            customer_return_id=ret.id, sale_order_line_id=ln.id, product_id=ln.product_id,
            qty=1, qty_scrap=0, unit_price=ln.unit_price,
        ))
        ev("customer_return", "created", f"{ret.name} created against {src.name}", now, ret.id)
        session.commit()
        pending_return = ret.name

    def _total(model) -> int:
        return session.exec(
            select(func.count()).select_from(model).where(model.company_id == company_id)
        ).one()

    final_stock = inventory_service.availability_map(session, [p.id for p in (table, shelf, chair, cabinet, desk)])
    return {
        "message": "Demo scenario loaded: Shiv Furniture Works — a full month of activity",
        "login_password": DEMO_PASSWORD,
        "summary": {
            "sale_orders": _total(SaleOrder),
            "purchase_orders": _total(PurchaseOrder),
            "manufacturing_orders": _total(ManufacturingOrder),
            "returns": _total(CustomerReturn),
            "days_of_history": SIM_DAYS,
        },
        "on_hand": {
            p.name: final_stock[p.id]["on_hand"] for p in (table, shelf, chair, cabinet, desk)
        },
        "returns": {"processed": processed_return, "pending": pending_return},
        "users": [
            {
                "email": email,
                "username": username,
                "kind": "System Administrator" if is_admin else "System User",
            }
            for email, _name, username, is_admin, _access in DEMO_USERS
        ],
        "hint": {
            "dashboard": "Open the dashboard — KPIs, trend, pipeline and at-risk panels are all populated.",
            "at_risk_make": f"{table_so.name} is short on Wooden Tables → an MO is already in progress.",
            "at_risk_buy": f"{chair_so.name} is partially delivered → a PO covers the remaining chairs.",
            "returns": "The Returns page shows one processed RMA and one awaiting processing.",
        },
    }
