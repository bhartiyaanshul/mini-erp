from sqlmodel import Session, select

from app.core.deps import load_access
from app.models import (
    AuditLog,
    BoM,
    BoMLine,
    BoMOperation,
    Company,
    CustomerReturn,
    ManufacturingOrder,
    Partner,
    Product,
    PurchaseOrder,
    ReturnState,
    SaleOrder,
    StockMove,
    User,
    WorkOrder,
)
from app.services import inventory_service


def _name(session: Session, model, _id):
    if _id is None:
        return None
    obj = session.get(model, _id)
    return getattr(obj, "name", None) if obj else None


def _attr(session: Session, model, _id, attr: str):
    if _id is None:
        return None
    obj = session.get(model, _id)
    return getattr(obj, attr, None) if obj else None


def company_out(c: Company) -> dict:
    """Branding/identity view of a company, used by the settings editor and the
    document generator. Coalesces a missing accent to the default teal."""
    return {
        "id": c.id,
        "name": c.name,
        "address": c.address or "",
        "email": c.email or "",
        "phone": c.phone or "",
        "website": c.website or "",
        "logo": c.logo or "",
        "brand_color": c.brand_color or "#0f766e",
        "gstin": c.gstin or "",
        "gst_rate": c.gst_rate or 0.0,
        "invoice_footer": c.invoice_footer or "",
    }


def user_out(session: Session, u: User) -> dict:
    """Auth/profile view of a user, including company name and access map."""
    company = session.get(Company, u.company_id)
    access = load_access(session, u.id)
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "full_name": u.full_name,
        "company_id": u.company_id,
        "company_name": company.name if company else "",
        "is_system_admin": u.is_system_admin,
        "photo": u.photo,
        "access": {m.value: lvl.value for m, lvl in access.items()},
    }


def user_admin_out(session: Session, u: User) -> dict:
    """Fuller view for the System Administrator's user-management screen."""
    access = load_access(session, u.id)
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "full_name": u.full_name,
        "is_system_admin": u.is_system_admin,
        "address": u.address,
        "position": u.position,
        "mobile_number": u.mobile_number,
        "photo": u.photo,
        "is_active": u.is_active,
        "access": {m.value: lvl.value for m, lvl in access.items()},
    }


def product_out(session: Session, p: Product, avail: dict | None = None) -> dict:
    if avail is None:
        avail = inventory_service.get_availability(session, p.id)
    return {
        "id": p.id,
        "name": p.name,
        "sku": p.sku,
        "sales_price": p.sales_price,
        "cost_price": p.cost_price,
        "uom": p.uom,
        "procure_on_demand": p.procure_on_demand,
        "procurement_type": p.procurement_type.value,
        "default_vendor_id": p.default_vendor_id,
        "default_vendor_name": _name(session, Partner, p.default_vendor_id),
        "bom_id": p.bom_id,
        "on_hand": avail["on_hand"],
        "reserved": avail["reserved"],
        "free_to_use": avail["free_to_use"],
    }


def products_list_out(session: Session, products: list[Product]) -> list[dict]:
    amap = inventory_service.availability_map(session, [p.id for p in products])
    return [product_out(session, p, amap.get(p.id)) for p in products]


def partner_out(p: Partner) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "type": p.type.value,
        "email": p.email,
        "phone": p.phone,
        "address": p.address,
    }


def stock_move_out(session: Session, m: StockMove) -> dict:
    return {
        "id": m.id,
        "product_id": m.product_id,
        "product_name": _name(session, Product, m.product_id),
        "qty": m.qty,
        "move_type": m.move_type.value,
        "state": m.state.value,
        "source": m.source.value,
        "source_doc_id": m.source_doc_id,
        "note": m.note,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "done_at": m.done_at.isoformat() if m.done_at else None,
    }


def sale_order_out(session: Session, so: SaleOrder) -> dict:
    lines = []
    total = 0.0
    for ln in so.lines:
        total += ln.qty * ln.unit_price
        lines.append(
            {
                "id": ln.id,
                "product_id": ln.product_id,
                "product_name": _name(session, Product, ln.product_id),
                "qty": ln.qty,
                "qty_reserved": ln.qty_reserved,
                "qty_delivered": ln.qty_delivered,
                "unit_price": ln.unit_price,
                "subtotal": round(ln.qty * ln.unit_price, 2),
            }
        )
    return {
        "id": so.id,
        "name": so.name,
        "partner_id": so.partner_id,
        "partner_name": _name(session, Partner, so.partner_id),
        "partner_email": _attr(session, Partner, so.partner_id, "email"),
        "state": so.state.value,
        "order_date": so.order_date.isoformat() if so.order_date else None,
        "promise_date": so.promise_date.isoformat() if so.promise_date else None,
        "total": round(total, 2),
        "lines": lines,
    }


def customer_return_out(session: Session, ret: CustomerReturn) -> dict:
    """View of a customer return / RMA: the lines coming back, how they split
    between restock and scrap, and the credit owed. While DRAFT the credit is a
    live preview computed from the lines; once COMPLETED the stored total is the
    record of what was actually credited."""
    lines = []
    credit = 0.0
    for ln in ret.lines:
        credit += ln.qty * ln.unit_price
        lines.append(
            {
                "id": ln.id,
                "sale_order_line_id": ln.sale_order_line_id,
                "product_id": ln.product_id,
                "product_name": _name(session, Product, ln.product_id),
                "qty": ln.qty,
                "qty_scrap": ln.qty_scrap,
                "qty_restock": round(ln.qty - ln.qty_scrap, 4),
                "unit_price": ln.unit_price,
                "subtotal": round(ln.qty * ln.unit_price, 2),
            }
        )
    so = session.get(SaleOrder, ret.sale_order_id)
    completed = ret.state == ReturnState.COMPLETED
    return {
        "id": ret.id,
        "name": ret.name,
        "sale_order_id": ret.sale_order_id,
        "sale_order_name": so.name if so else None,
        "partner_id": ret.partner_id,
        "partner_name": _name(session, Partner, ret.partner_id),
        "partner_email": _attr(session, Partner, ret.partner_id, "email"),
        "state": ret.state.value,
        "reason": ret.reason,
        "credit_total": round(ret.credit_total if completed else credit, 2),
        "created_at": ret.created_at.isoformat() if ret.created_at else None,
        "processed_at": ret.processed_at.isoformat() if ret.processed_at else None,
        "lines": lines,
    }


def purchase_order_out(session: Session, po: PurchaseOrder) -> dict:
    lines = []
    total = 0.0
    for ln in po.lines:
        total += ln.qty * ln.unit_price
        lines.append(
            {
                "id": ln.id,
                "product_id": ln.product_id,
                "product_name": _name(session, Product, ln.product_id),
                "qty": ln.qty,
                "qty_received": ln.qty_received,
                "unit_price": ln.unit_price,
                "subtotal": round(ln.qty * ln.unit_price, 2),
            }
        )
    return {
        "id": po.id,
        "name": po.name,
        "partner_id": po.partner_id,
        "partner_name": _name(session, Partner, po.partner_id),
        "partner_email": _attr(session, Partner, po.partner_id, "email"),
        "state": po.state.value,
        "origin": po.origin,
        "order_date": po.order_date.isoformat() if po.order_date else None,
        "expected_receipt_date": po.expected_receipt_date.isoformat() if po.expected_receipt_date else None,
        "total": round(total, 2),
        "lines": lines,
    }


def mo_out(session: Session, mo: ManufacturingOrder) -> dict:
    product = session.get(Product, mo.product_id)
    components = []
    if mo.bom_id:
        bom_lines = session.exec(select(BoMLine).where(BoMLine.bom_id == mo.bom_id)).all()
        for bl in bom_lines:
            avail = inventory_service.get_availability(session, bl.component_product_id)
            components.append(
                {
                    "component_product_id": bl.component_product_id,
                    "component_name": _name(session, Product, bl.component_product_id),
                    "qty_per_unit": bl.qty,
                    "qty_required": round(bl.qty * mo.qty, 4),
                    "free_to_use": avail["free_to_use"],
                    "shortage": max(0.0, round((bl.qty * mo.qty) - avail["free_to_use"], 4)),
                }
            )
    work_orders = [
        {
            "id": wo.id,
            "operation_name": wo.operation_name,
            "duration_mins": wo.duration_mins,
            "work_center": wo.work_center,
            "sequence": wo.sequence,
            "state": wo.state.value,
        }
        for wo in sorted(mo.work_orders, key=lambda w: w.sequence)
    ]
    return {
        "id": mo.id,
        "name": mo.name,
        "product_id": mo.product_id,
        "product_name": product.name if product else None,
        "bom_id": mo.bom_id,
        "qty": mo.qty,
        "state": mo.state.value,
        "origin": mo.origin,
        "planned_start": mo.planned_start.isoformat() if mo.planned_start else None,
        "planned_finish": mo.planned_finish.isoformat() if mo.planned_finish else None,
        "created_at": mo.created_at.isoformat() if mo.created_at else None,
        "components": components,
        "work_orders": work_orders,
    }


def bom_out(session: Session, bom: BoM) -> dict:
    return {
        "id": bom.id,
        "name": bom.name,
        "product_id": bom.product_id,
        "product_name": _name(session, Product, bom.product_id),
        "lines": [
            {
                "id": bl.id,
                "component_product_id": bl.component_product_id,
                "component_name": _name(session, Product, bl.component_product_id),
                "qty": bl.qty,
            }
            for bl in bom.lines
        ],
        "operations": [
            {
                "id": op.id,
                "name": op.name,
                "duration_mins": op.duration_mins,
                "work_center": op.work_center,
                "sequence": op.sequence,
            }
            for op in sorted(bom.operations, key=lambda o: o.sequence)
        ],
    }


def audit_out(session: Session, a: AuditLog) -> dict:
    user = session.get(User, a.user_id) if a.user_id else None
    return {
        "id": a.id,
        "entity_type": a.entity_type,
        "entity_id": a.entity_id,
        "action": a.action,
        "description": a.description,
        "user_id": a.user_id,
        "user_name": user.full_name if user else None,
        "payload": a.payload,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }
