from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, desc, select

from app.core.db import get_session
from app.core.deps import require_access
from app.events.bus import emit
from app.models import CustomerReturn, CustomerReturnLine, SaleOrder, User
from app.models.enums import ModuleName
from app.schemas import ReturnIn
from app.serializers import customer_return_out
from app.services import audit_service, returns_service
from app.services.common import next_seq_name

router = APIRouter(prefix="/api/returns", tags=["returns"])

# Returns are a customer/sales-side flow, so they reuse the Sales access grid.
view = require_access(ModuleName.SALES, "view")
create = require_access(ModuleName.SALES, "create")
approve = require_access(ModuleName.SALES, "approve")


def _get_return(session: Session, return_id: int, company_id: int) -> CustomerReturn:
    ret = session.get(CustomerReturn, return_id)
    if not ret or ret.company_id != company_id:
        raise HTTPException(404, "Return not found")
    return ret


@router.get("")
def list_returns(session: Session = Depends(get_session), user: User = Depends(view)):
    rets = session.exec(
        select(CustomerReturn)
        .where(CustomerReturn.company_id == user.company_id)
        .order_by(desc(CustomerReturn.id))
    ).all()
    return [customer_return_out(session, r) for r in rets]


@router.get("/returnable")
def returnable(session: Session = Depends(get_session), user: User = Depends(view)):
    """Delivered orders with units still eligible to come back — feeds the form."""
    return returns_service.returnable_orders(session, user.company_id)


@router.get("/{return_id}")
def get_return(return_id: int, session: Session = Depends(get_session), user: User = Depends(view)):
    return customer_return_out(session, _get_return(session, return_id, user.company_id))


@router.post("")
def create_return(data: ReturnIn, session: Session = Depends(get_session), user: User = Depends(create)):
    so = session.get(SaleOrder, data.sale_order_id)
    if not so or so.company_id != user.company_id:
        raise HTTPException(404, "Sale order not found")
    if not data.lines:
        raise HTTPException(400, "A return needs at least one line")

    rmap = returns_service.returned_map(session, [so.id])
    soline_by_id = {ln.id: ln for ln in so.lines}

    ret = CustomerReturn(
        company_id=user.company_id,
        name=next_seq_name(session, CustomerReturn, "RMA", user.company_id),
        sale_order_id=so.id,
        partner_id=so.partner_id,
        reason=data.reason or "",
        created_by_id=user.id,
    )
    session.add(ret)
    session.flush()

    for ln in data.lines:
        soline = soline_by_id.get(ln.sale_order_line_id)
        if not soline:
            raise HTTPException(400, "A return line does not match the sale order")
        returnable_qty = round(soline.qty_delivered - rmap.get(soline.id, 0.0), 4)
        if ln.qty > returnable_qty + 1e-9:
            raise HTTPException(
                400, f"Cannot return more than the {returnable_qty:g} delivered unit(s) still returnable"
            )
        if ln.qty_scrap < -1e-9 or ln.qty_scrap > ln.qty + 1e-9:
            raise HTTPException(400, "Scrapped quantity must be between 0 and the returned quantity")
        session.add(
            CustomerReturnLine(
                customer_return_id=ret.id,
                sale_order_line_id=soline.id,
                product_id=soline.product_id,
                qty=ln.qty,
                qty_scrap=ln.qty_scrap,
                unit_price=soline.unit_price,
            )
        )

    audit_service.log(
        session,
        company_id=user.company_id,
        entity_type="customer_return",
        entity_id=ret.id,
        action="created",
        description=f"{ret.name} created against {so.name}",
        user_id=user.id,
    )
    session.commit()
    session.refresh(ret)
    emit("return_created", {"id": ret.id, "name": ret.name})
    return customer_return_out(session, ret)


@router.post("/{return_id}/process")
def process_return(return_id: int, session: Session = Depends(get_session), user: User = Depends(approve)):
    ret = _get_return(session, return_id, user.company_id)
    try:
        result = returns_service.process_return(session, ret, user=user)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {
        "return": customer_return_out(session, result["return"]),
        "restocked": result["restocked"],
        "scrapped": result["scrapped"],
        "credit": result["credit"],
    }


@router.post("/{return_id}/cancel")
def cancel_return(return_id: int, session: Session = Depends(get_session), user: User = Depends(approve)):
    ret = _get_return(session, return_id, user.company_id)
    try:
        ret = returns_service.cancel_return(session, ret, user=user)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return customer_return_out(session, ret)
