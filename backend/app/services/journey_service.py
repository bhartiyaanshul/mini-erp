"""Order Journey — a deterministic, human-readable timeline for a sale order.

This reads nothing new: it assembles the order's lifecycle purely from data the
system already produces — the SO's state and lines, the Manufacturing/Purchase
orders auto-created for it (linked via `origin == SO.name`), and their work-order
progress. It makes the otherwise-invisible automation legible.

`build_journey` is the rich internal view (shows the MO/PO refs, the automation).
`public_journey` is the sanitized, customer-facing view (no money, no internal
refs) served behind a signed token for a shareable tracking link.
"""

from datetime import datetime

from sqlmodel import Session, select

from app.core.security import create_track_token
from app.models import (
    Company,
    CustomerReturn,
    ManufacturingOrder,
    Partner,
    Product,
    PurchaseOrder,
    SaleOrder,
)
from app.models.enums import (
    MOState,
    PurchaseOrderState,
    ReturnState,
    SaleOrderState,
    WorkOrderState,
)
from app.services.common import fmt_qty

EPS = 1e-6


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _progress(so: SaleOrder) -> dict:
    total = round(sum(ln.qty for ln in so.lines), 4)
    reserved = round(sum(ln.qty_reserved for ln in so.lines), 4)
    delivered = round(sum(ln.qty_delivered for ln in so.lines), 4)
    # Units that physically exist for this order: reserved (allocated) + already shipped.
    secured = round(reserved + delivered, 4)
    return {
        "total": total,
        "reserved": reserved,
        "delivered": delivered,
        "secured": secured,
        "goods_ready": secured + EPS >= total > 0,
    }


def _linked_docs(session: Session, so: SaleOrder):
    mos = list(
        session.exec(
            select(ManufacturingOrder).where(
                ManufacturingOrder.company_id == so.company_id,
                ManufacturingOrder.origin == so.name,
            )
        ).all()
    )
    pos = list(
        session.exec(
            select(PurchaseOrder).where(
                PurchaseOrder.company_id == so.company_id,
                PurchaseOrder.origin == so.name,
            )
        ).all()
    )
    return mos, pos


def _mark_current(steps: list[dict]) -> None:
    """The first not-yet-done step is the one in progress."""
    for s in steps:
        if s["status"] == "pending":
            s["status"] = "current"
            return


def _finalize(steps: list[dict], cancelled: bool) -> tuple[int, str]:
    done = sum(1 for s in steps if s["status"] == "done")
    percent = round(100 * done / len(steps)) if steps else 0
    if cancelled:
        return percent, "Cancelled"
    current = next((s for s in steps if s["status"] == "current"), None)
    if current is None:
        return 100, "Delivered"
    return percent, current["label"]


def _item_name(session: Session, product_id: int) -> str:
    p = session.get(Product, product_id)
    return p.name if p else f"#{product_id}"


# --------------------------------------------------------------------------- #
# Internal (staff) view — rich, shows the automation                          #
# --------------------------------------------------------------------------- #
def build_journey(session: Session, so: SaleOrder) -> dict:
    p = _progress(so)
    mos, pos = _linked_docs(session, so)
    state = so.state
    cancelled = state == SaleOrderState.CANCELLED
    confirmed = state in (
        SaleOrderState.CONFIRMED,
        SaleOrderState.PARTIALLY_DELIVERED,
        SaleOrderState.FULLY_DELIVERED,
    )
    partner = session.get(Partner, so.partner_id)
    items = [
        {
            "name": _item_name(session, ln.product_id),
            "qty": ln.qty,
            "reserved": ln.qty_reserved,
            "delivered": ln.qty_delivered,
        }
        for ln in so.lines
    ]
    total_value = round(sum(ln.qty * ln.unit_price for ln in so.lines), 2)

    steps: list[dict] = []

    def add(key, label, detail, done, ts=None, docs=None, auto=False):
        steps.append(
            {
                "key": key,
                "label": label,
                "detail": detail,
                "status": "done" if done else "pending",
                "ts": _iso(ts),
                "docs": docs or [],
                "auto": auto,
            }
        )

    add(
        "placed",
        "Order placed",
        f"{len(so.lines)} line(s) · {fmt_qty(p['total'])} units",
        done=True,
        ts=so.order_date,
    )

    if cancelled:
        add("cancelled", "Order cancelled", "This order was cancelled", done=False)
        _mark_current(steps)
        percent, status_label = _finalize(steps, cancelled=True)
    else:
        confirm_detail = (
            f"{fmt_qty(p['reserved'])} of {fmt_qty(p['total'])} reserved from stock"
            if p["reserved"] > 0
            else ("Full quantity routed to procurement" if confirmed else "Awaiting confirmation")
        )
        add("confirmed", "Confirmed & stock reserved", confirm_detail, done=confirmed)

        if mos or pos:
            doc_refs = [{"type": "MO", "name": m.name, "state": m.state.value} for m in mos]
            doc_refs += [{"type": "PO", "name": po.name, "state": po.state.value} for po in pos]
            created_ats = [m.created_at for m in mos] + [po.order_date for po in pos]
            add(
                "sourcing",
                "Auto-procurement fired",
                "Created " + ", ".join(d["name"] for d in doc_refs),
                done=True,
                ts=min((t for t in created_ats if t), default=None),
                docs=doc_refs,
                auto=True,
            )

            mos_done = all(m.state == MOState.DONE for m in mos)
            pos_done = all(po.state == PurchaseOrderState.FULLY_RECEIVED for po in pos)
            fulfilled = mos_done and pos_done
            if fulfilled:
                fulfil_detail = "All goods produced and received"
            else:
                parts: list[str] = []
                for m in mos:
                    if m.state != MOState.DONE:
                        total_ops = len(m.work_orders)
                        done_ops = sum(1 for wo in m.work_orders if wo.state == WorkOrderState.DONE)
                        parts.append(
                            f"{m.name}: {done_ops}/{total_ops} operations"
                            if total_ops
                            else f"{m.name}: {m.state.value}"
                        )
                for po in pos:
                    if po.state != PurchaseOrderState.FULLY_RECEIVED:
                        parts.append(f"{po.name}: awaiting supplier")
                fulfil_detail = " · ".join(parts) or "In progress"
            add("fulfilment", "In production / inbound", fulfil_detail, done=fulfilled)

        ready_done = p["goods_ready"]
        if p["delivered"] >= p["total"] - EPS and p["total"] > 0:
            ready_detail = "All units dispatched"
        elif ready_done:
            ready_detail = f"All {fmt_qty(p['total'])} units allocated and ready"
        else:
            ready_detail = f"{fmt_qty(p['secured'])} of {fmt_qty(p['total'])} ready"
        add("ready", "Ready to ship", ready_detail, done=ready_done)

        if state == SaleOrderState.FULLY_DELIVERED:
            deliver_detail = f"Delivered to {partner.name if partner else 'customer'}"
        elif state == SaleOrderState.PARTIALLY_DELIVERED:
            deliver_detail = f"{fmt_qty(p['delivered'])} of {fmt_qty(p['total'])} delivered"
        else:
            deliver_detail = "Awaiting dispatch"
        add("delivered", "Delivered", deliver_detail, done=state == SaleOrderState.FULLY_DELIVERED)

        # A reverse flow linked back here: surface any processed customer return.
        returns = list(
            session.exec(
                select(CustomerReturn).where(
                    CustomerReturn.company_id == so.company_id,
                    CustomerReturn.sale_order_id == so.id,
                    CustomerReturn.state == ReturnState.COMPLETED,
                )
            ).all()
        )
        if returns:
            rqty = round(sum(ln.qty for r in returns for ln in r.lines), 4)
            rcredit = round(sum(r.credit_total for r in returns), 2)
            latest = max((r.processed_at for r in returns if r.processed_at), default=None)
            add(
                "returned",
                "Returned & credited",
                f"{fmt_qty(rqty)} unit(s) returned · credit note {rcredit:g}",
                done=True,
                ts=latest,
                docs=[{"type": "RMA", "name": r.name, "state": r.state.value} for r in returns],
            )

        _mark_current(steps)
        percent, status_label = _finalize(steps, cancelled=False)

    return {
        "order": so.name,
        "customer": partner.name if partner else "",
        "state": state.value,
        "status_label": status_label,
        "percent": percent,
        "order_date": _iso(so.order_date),
        "promise_date": _iso(so.promise_date),
        "items": items,
        "total": total_value,
        "steps": steps,
        "track_path": f"/track/{create_track_token(so.id)}",
    }


# --------------------------------------------------------------------------- #
# Public (customer) view — sanitized, fixed 5-stage tracker                    #
# --------------------------------------------------------------------------- #
def public_journey(session: Session, so: SaleOrder) -> dict:
    p = _progress(so)
    state = so.state
    cancelled = state == SaleOrderState.CANCELLED
    confirmed = state in (
        SaleOrderState.CONFIRMED,
        SaleOrderState.PARTIALLY_DELIVERED,
        SaleOrderState.FULLY_DELIVERED,
    )
    company = session.get(Company, so.company_id)
    partner = session.get(Partner, so.partner_id)
    items = [{"name": _item_name(session, ln.product_id), "qty": ln.qty} for ln in so.lines]

    steps: list[dict] = []

    def add(key, label, detail, done, ts=None):
        steps.append(
            {
                "key": key,
                "label": label,
                "detail": detail,
                "status": "done" if done else "pending",
                "ts": _iso(ts),
            }
        )

    add("received", "Order received", "We have your order", done=True, ts=so.order_date)

    if cancelled:
        add("cancelled", "Order cancelled", "This order was cancelled", done=False)
    else:
        add("confirmed", "Order confirmed", "Your order is confirmed", done=confirmed)
        add(
            "preparing",
            "In preparation",
            "We're preparing your items"
            if not p["goods_ready"]
            else "Your items are prepared",
            done=p["goods_ready"],
        )
        ready_detail = (
            f"Expected by {so.promise_date.date().isoformat()}"
            if so.promise_date and not p["goods_ready"]
            else "Packed and ready to go"
        )
        add("ready", "Ready for dispatch", ready_detail, done=p["goods_ready"])
        if state == SaleOrderState.FULLY_DELIVERED:
            deliver_detail = "Your order has been delivered"
        elif state == SaleOrderState.PARTIALLY_DELIVERED:
            deliver_detail = "Part of your order is on the way"
        else:
            deliver_detail = "Awaiting dispatch"
        add(
            "delivered",
            "Delivered",
            deliver_detail,
            done=state == SaleOrderState.FULLY_DELIVERED,
        )

    _mark_current(steps)
    percent, status_label = _finalize(steps, cancelled=cancelled)

    return {
        "order": so.name,
        "company": company.name if company else "",
        "customer": partner.name if partner else "",
        "status_label": status_label,
        "percent": percent,
        "order_date": _iso(so.order_date),
        "promise_date": _iso(so.promise_date),
        "items": items,
        "steps": steps,
    }
