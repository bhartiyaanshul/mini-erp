from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.events.bus import emit
from app.models import BoMLine, BoMOperation, ManufacturingOrder, Product, WorkOrder
from app.models.enums import MOState, MoveSource, MoveState, MoveType, WorkOrderState
from app.services import audit_service, inventory_service
from app.services.common import fmt_qty, next_seq_name


def create_mo(
    session: Session,
    *,
    company_id: int,
    product_id: int,
    qty: float,
    origin: str = "",
    user=None,
    auto_confirm: bool = False,
    commit: bool = True,
) -> ManufacturingOrder:
    product = session.get(Product, product_id)
    planned_start = datetime.utcnow()
    planned_finish = planned_start + timedelta(days=max(1, round(qty / 8)))
    mo = ManufacturingOrder(
        company_id=company_id,
        name=next_seq_name(session, ManufacturingOrder, "MO", company_id),
        product_id=product_id,
        bom_id=product.bom_id if product else None,
        qty=qty,
        origin=origin,
        planned_start=planned_start,
        planned_finish=planned_finish,
        created_by_id=user.id if user else None,
        state=MOState.DRAFT,
    )
    session.add(mo)
    session.flush()
    desc = f"MO created for {fmt_qty(qty)} x {product.name if product else product_id}"
    if origin:
        desc += f" (origin {origin})"
    audit_service.log(
        session,
        company_id=company_id,
        entity_type="manufacturing_order",
        entity_id=mo.id,
        action="created",
        description=desc,
        user_id=user.id if user else None,
        payload={"qty": qty, "product_id": product_id, "origin": origin},
    )
    if auto_confirm and mo.bom_id:
        confirm_mo(session, mo, user=user, commit=False)
    if commit:
        session.commit()
        emit("manufacturing_order_created", {"id": mo.id, "name": mo.name}, message=f"{mo.name} created")
    return mo


def confirm_mo(session: Session, mo: ManufacturingOrder, *, user=None, commit: bool = True) -> dict:
    if mo.state != MOState.DRAFT:
        raise ValueError(f"MO {mo.name} cannot be confirmed from state '{mo.state.value}'")

    consumption: list[dict] = []
    procurements: list[dict] = []
    if mo.bom_id:
        lines = session.exec(select(BoMLine).where(BoMLine.bom_id == mo.bom_id)).all()
        for bl in lines:
            need = bl.qty * mo.qty
            avail = inventory_service.get_availability(session, bl.component_product_id)
            reserve_qty = max(0.0, min(avail["free_to_use"], need))
            shortage = round(need - reserve_qty, 4)
            if reserve_qty > 0:
                inventory_service.create_move(
                    session,
                    company_id=mo.company_id,
                    product_id=bl.component_product_id,
                    qty=reserve_qty,
                    move_type=MoveType.OUT,
                    source=MoveSource.MANUFACTURING_CONSUME,
                    state=MoveState.RESERVED,
                    source_doc_id=mo.id,
                    note=f"Reserved for {mo.name}",
                )
            consumption.append(
                {
                    "component_product_id": bl.component_product_id,
                    "qty_required": need,
                    "qty_reserved": reserve_qty,
                    "shortage": shortage,
                }
            )
            if shortage > 0:
                component = session.get(Product, bl.component_product_id)
                if component and component.procure_on_demand:
                    from app.services import procurement_service

                    res = procurement_service.procure(
                        session,
                        company_id=mo.company_id,
                        product_id=bl.component_product_id,
                        qty=shortage,
                        origin=f"{mo.origin or mo.name} / {mo.name} component",
                        user=user,
                    )
                    res["component_for"] = mo.name
                    procurements.append(res)

        ops = session.exec(
            select(BoMOperation).where(BoMOperation.bom_id == mo.bom_id).order_by(BoMOperation.sequence)
        ).all()
        for op in ops:
            session.add(
                WorkOrder(
                    mo_id=mo.id,
                    operation_name=op.name,
                    duration_mins=op.duration_mins,
                    work_center=op.work_center,
                    sequence=op.sequence,
                    state=WorkOrderState.PENDING,
                )
            )

    mo.state = MOState.CONFIRMED
    session.add(mo)
    session.flush()
    audit_service.log(
        session,
        company_id=mo.company_id,
        entity_type="manufacturing_order",
        entity_id=mo.id,
        action="confirmed",
        description=f"{mo.name} confirmed — components reserved, shortages procured, work orders generated",
        user_id=user.id if user else None,
        payload={"consumption": consumption, "procurements": [p["message"] for p in procurements]},
    )
    if commit:
        session.commit()
        emit("manufacturing_order_confirmed", {"id": mo.id, "name": mo.name})
        for p in procurements:
            if p["kind"] in ("manufacture", "buy"):
                emit(
                    "procurement_triggered",
                    {
                        "kind": p["kind"],
                        "doc_name": p["doc_name"],
                        "doc_id": p["doc_id"],
                        "qty": p["qty"],
                        "product": p["product"],
                        "origin": mo.name,
                    },
                    message=p["message"],
                )
        emit("stock_changed", {})
    return {"mo": mo, "consumption": consumption, "procurements": procurements}


def _component_requirements(session: Session, mo: ManufacturingOrder) -> dict[int, float]:
    if not mo.bom_id:
        return {}
    lines = session.exec(select(BoMLine).where(BoMLine.bom_id == mo.bom_id)).all()
    return {bl.component_product_id: round(bl.qty * mo.qty, 4) for bl in lines}


def _reserved_qty_by_component(session: Session, mo: ManufacturingOrder) -> dict[int, float]:
    reserved = inventory_service.reserved_moves_for(
        session, source=MoveSource.MANUFACTURING_CONSUME, source_doc_id=mo.id
    )
    totals: dict[int, float] = {}
    for mv in reserved:
        totals[mv.product_id] = round(totals.get(mv.product_id, 0.0) + mv.qty, 4)
    return totals


def _top_up_component_reservations(session: Session, mo: ManufacturingOrder) -> list[dict]:
    topped: list[dict] = []
    requirements = _component_requirements(session, mo)
    reserved = _reserved_qty_by_component(session, mo)
    for product_id, required in requirements.items():
        missing = round(required - reserved.get(product_id, 0.0), 4)
        if missing <= 0:
            continue
        free = inventory_service.get_availability(session, product_id)["free_to_use"]
        qty = max(0.0, min(free, missing))
        if qty <= 0:
            continue
        inventory_service.create_move(
            session,
            company_id=mo.company_id,
            product_id=product_id,
            qty=qty,
            move_type=MoveType.OUT,
            source=MoveSource.MANUFACTURING_CONSUME,
            state=MoveState.RESERVED,
            source_doc_id=mo.id,
            note=f"Reserved for {mo.name}",
        )
        topped.append({"product_id": product_id, "qty": qty})
    return topped


def complete_mo(session: Session, mo: ManufacturingOrder, *, user=None, commit: bool = True) -> dict:
    if mo.state not in (MOState.CONFIRMED, MOState.IN_PROGRESS):
        raise ValueError(f"MO {mo.name} cannot be completed from state '{mo.state.value}'")

    product = session.get(Product, mo.product_id)
    _top_up_component_reservations(session, mo)
    requirements = _component_requirements(session, mo)
    reserved_totals = _reserved_qty_by_component(session, mo)
    missing = [
        {
            "product_id": pid,
            "required": required,
            "reserved": reserved_totals.get(pid, 0.0),
            "shortage": round(required - reserved_totals.get(pid, 0.0), 4),
        }
        for pid, required in requirements.items()
        if reserved_totals.get(pid, 0.0) + 1e-9 < required
    ]
    if missing:
        names = []
        for item in missing:
            component = session.get(Product, item["product_id"])
            names.append(f"{component.name if component else item['product_id']} short {item['shortage']:g}")
        raise ValueError(f"Cannot complete {mo.name}; component procurement is still pending: {', '.join(names)}")

    # Consume reserved components: flip reserved OUT -> done OUT.
    reserved = inventory_service.reserved_moves_for(
        session, source=MoveSource.MANUFACTURING_CONSUME, source_doc_id=mo.id
    )
    consumed: list[dict] = []
    for mv in reserved:
        inventory_service.complete_move(session, mv)
        consumed.append({"product_id": mv.product_id, "qty": mv.qty})

    # Produce finished goods: done IN.
    inventory_service.create_move(
        session,
        company_id=mo.company_id,
        product_id=mo.product_id,
        qty=mo.qty,
        move_type=MoveType.IN,
        source=MoveSource.MANUFACTURING_PRODUCE,
        state=MoveState.DONE,
        source_doc_id=mo.id,
        note=f"Produced by {mo.name}",
    )

    for wo in mo.work_orders:
        wo.state = WorkOrderState.DONE
        session.add(wo)

    mo.state = MOState.DONE
    session.add(mo)
    session.flush()
    audit_service.log(
        session,
        company_id=mo.company_id,
        entity_type="manufacturing_order",
        entity_id=mo.id,
        action="completed",
        description=f"{mo.name} completed — produced {fmt_qty(mo.qty)} x {product.name if product else mo.product_id}",
        user_id=user.id if user else None,
        payload={"consumed": consumed, "produced": {"product_id": mo.product_id, "qty": mo.qty}},
    )
    if commit:
        session.commit()
        emit(
            "manufacturing_order_completed",
            {"id": mo.id, "name": mo.name},
            message=f"{mo.name} completed — {fmt_qty(mo.qty)} {product.name if product else ''} produced",
        )
        emit("stock_changed", {"product_id": mo.product_id})
    return {"mo": mo, "consumed": consumed, "produced": {"product_id": mo.product_id, "qty": mo.qty}}


def start_work_order(session: Session, wo: WorkOrder, *, user=None) -> WorkOrder:
    wo.state = WorkOrderState.IN_PROGRESS
    if wo.mo and wo.mo.state == MOState.CONFIRMED:
        wo.mo.state = MOState.IN_PROGRESS
        session.add(wo.mo)
    session.add(wo)
    session.commit()
    session.refresh(wo)
    emit("work_order_updated", {"id": wo.id, "mo_id": wo.mo_id, "state": wo.state.value})
    return wo


def complete_work_order(session: Session, wo: WorkOrder, *, user=None) -> WorkOrder:
    wo.state = WorkOrderState.DONE
    if wo.mo and wo.mo.state == MOState.CONFIRMED:
        wo.mo.state = MOState.IN_PROGRESS
        session.add(wo.mo)
    session.add(wo)
    session.commit()
    session.refresh(wo)
    emit("work_order_updated", {"id": wo.id, "mo_id": wo.mo_id, "state": wo.state.value})
    return wo
