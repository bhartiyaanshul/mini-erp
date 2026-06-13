from sqlmodel import Session, select

from app.models import (
    AuditLog,
    BoM,
    BoMLine,
    BoMOperation,
    ManufacturingOrder,
    Partner,
    Product,
    PurchaseOrder,
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
        "state": so.state.value,
        "order_date": so.order_date.isoformat() if so.order_date else None,
        "total": round(total, 2),
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
        "state": po.state.value,
        "origin": po.origin,
        "order_date": po.order_date.isoformat() if po.order_date else None,
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
