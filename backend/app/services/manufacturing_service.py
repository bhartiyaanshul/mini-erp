from sqlmodel import Session, select

from app.events.bus import emit
from app.models import BoMLine, BoMOperation, ManufacturingOrder, Product, WorkOrder
from app.models.enums import MOState, MoveSource, MoveState, MoveType, WorkOrderState
from app.services import audit_service, inventory_service
from app.services.common import fmt_qty, next_seq_name


def create_mo(
    session: Session,
    *,
    product_id: int,
    qty: float,
    origin: str = "",
    user=None,
    auto_confirm: bool = False,
    commit: bool = True,
) -> ManufacturingOrder:
    product = session.get(Product, product_id)
    mo = ManufacturingOrder(
        name=next_seq_name(session, ManufacturingOrder, "MO"),
        product_id=product_id,
        bom_id=product.bom_id if product else None,
        qty=qty,
        origin=origin,
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
    if mo.bom_id:
        lines = session.exec(select(BoMLine).where(BoMLine.bom_id == mo.bom_id)).all()
        for bl in lines:
            need = bl.qty * mo.qty
            inventory_service.create_move(
                session,
                product_id=bl.component_product_id,
                qty=need,
                move_type=MoveType.OUT,
                source=MoveSource.MANUFACTURING_CONSUME,
                state=MoveState.RESERVED,
                source_doc_id=mo.id,
                note=f"Reserved for {mo.name}",
            )
            consumption.append({"component_product_id": bl.component_product_id, "qty": need})

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
        entity_type="manufacturing_order",
        entity_id=mo.id,
        action="confirmed",
        description=f"{mo.name} confirmed — components reserved, work orders generated",
        user_id=user.id if user else None,
        payload={"consumption": consumption},
    )
    if commit:
        session.commit()
        emit("manufacturing_order_confirmed", {"id": mo.id, "name": mo.name})
    return {"mo": mo, "consumption": consumption}


def complete_mo(session: Session, mo: ManufacturingOrder, *, user=None, commit: bool = True) -> dict:
    if mo.state not in (MOState.CONFIRMED, MOState.IN_PROGRESS):
        raise ValueError(f"MO {mo.name} cannot be completed from state '{mo.state.value}'")

    product = session.get(Product, mo.product_id)

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
