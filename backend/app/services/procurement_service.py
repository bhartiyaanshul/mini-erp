from sqlmodel import Session

from app.models import Product
from app.models.enums import ProcurementType
from app.services import audit_service, manufacturing_service, purchase_service
from app.services.common import fmt_qty


def procure(session: Session, *, product_id: int, qty: float, origin: str = "", user=None) -> dict:
    """The automation centerpiece.

    Given a shortage, create the right replenishment based on the product's
    configured procurement strategy:
      - manufacture -> Manufacturing Order (auto-confirmed, ready to complete)
      - buy         -> Purchase Order to the default vendor (auto-confirmed)

    Returns a structured, human-readable result the UI surfaces as a toast.
    Flush-only; the calling sales confirmation owns the commit + events.
    """
    product = session.get(Product, product_id)
    pname = product.name if product else f"product #{product_id}"

    if product and product.procurement_type == ProcurementType.MANUFACTURE:
        mo = manufacturing_service.create_mo(
            session, product_id=product_id, qty=qty, origin=origin, user=user, auto_confirm=True, commit=False
        )
        msg = f"Shortage of {fmt_qty(qty)} {pname} → auto-created Manufacturing Order {mo.name}"
        audit_service.log(
            session,
            entity_type="procurement",
            entity_id=mo.id,
            action="auto_manufacture",
            description=msg,
            user_id=user.id if user else None,
            payload={"product_id": product_id, "qty": qty, "origin": origin, "doc": mo.name},
        )
        return {
            "kind": "manufacture",
            "doc_name": mo.name,
            "doc_id": mo.id,
            "qty": qty,
            "product": pname,
            "message": msg,
        }

    vendor_id = product.default_vendor_id if product else None
    po = purchase_service.create_po(
        session,
        vendor_id=vendor_id,
        line_items=[{"product_id": product_id, "qty": qty}],
        origin=origin,
        user=user,
        auto_confirm=True,
        commit=False,
    )
    msg = f"Shortage of {fmt_qty(qty)} {pname} → auto-created Purchase Order {po.name}"
    audit_service.log(
        session,
        entity_type="procurement",
        entity_id=po.id,
        action="auto_buy",
        description=msg,
        user_id=user.id if user else None,
        payload={"product_id": product_id, "qty": qty, "origin": origin, "doc": po.name},
    )
    return {
        "kind": "buy",
        "doc_name": po.name,
        "doc_id": po.id,
        "qty": qty,
        "product": pname,
        "message": msg,
    }
