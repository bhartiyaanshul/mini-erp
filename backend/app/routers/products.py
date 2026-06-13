from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.deps import get_current_user, require_access
from app.events.bus import emit
from app.models import Product, User
from app.models.enums import ModuleName
from app.schemas import ProductIn, ProductUpdate
from app.serializers import product_out, products_list_out
from app.services import audit_service

router = APIRouter(prefix="/api/products", tags=["products"])

create = require_access(ModuleName.PRODUCT, "create")
edit = require_access(ModuleName.PRODUCT, "edit")


def _get_product(session: Session, product_id: int, company_id: int) -> Product:
    p = session.get(Product, product_id)
    if not p or p.company_id != company_id:
        raise HTTPException(404, "Product not found")
    return p


@router.get("")
def list_products(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    products = list(
        session.exec(
            select(Product).where(Product.company_id == user.company_id).order_by(Product.name)
        ).all()
    )
    return products_list_out(session, products)


@router.get("/{product_id}")
def get_product(product_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    return product_out(session, _get_product(session, product_id, user.company_id))


@router.post("")
def create_product(data: ProductIn, session: Session = Depends(get_session), user: User = Depends(create)):
    p = Product(company_id=user.company_id, **data.model_dump())
    session.add(p)
    session.flush()
    audit_service.log(
        session,
        company_id=user.company_id,
        entity_type="product",
        entity_id=p.id,
        action="created",
        description=f"Product '{p.name}' created",
        user_id=user.id,
        payload=data.model_dump(),
    )
    session.commit()
    session.refresh(p)
    emit("product_created", {"id": p.id, "name": p.name})
    return product_out(session, p)


@router.put("/{product_id}")
def update_product(product_id: int, data: ProductUpdate, session: Session = Depends(get_session), user: User = Depends(edit)):
    p = _get_product(session, product_id, user.company_id)
    changes = data.model_dump(exclude_unset=True)
    price_changed = {}
    for k, v in changes.items():
        old = getattr(p, k)
        if k in ("sales_price", "cost_price") and old != v:
            price_changed[k] = {"from": old, "to": v}
        setattr(p, k, v)
    session.add(p)
    if price_changed:
        audit_service.log(
            session,
            company_id=user.company_id,
            entity_type="product",
            entity_id=p.id,
            action="price_updated",
            description=f"Price updated on '{p.name}'",
            user_id=user.id,
            payload=price_changed,
        )
    else:
        audit_service.log(
            session,
            company_id=user.company_id,
            entity_type="product",
            entity_id=p.id,
            action="updated",
            description=f"Product '{p.name}' updated",
            user_id=user.id,
            payload=changes,
        )
    session.commit()
    session.refresh(p)
    emit("product_updated", {"id": p.id, "name": p.name})
    return product_out(session, p)
