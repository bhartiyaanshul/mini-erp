"""One-click branded documents: download a PDF or email it to the counterparty.

A single registry maps each document type to the module it belongs to (for
RBAC), how to load + serialize its record, and which PDF builder to call. Both
endpoints resolve the module from the path and gate on `view` access to it, then
scope every record lookup to the caller's company.
"""

import re

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session

from app.core.db import get_session
from app.core.deps import get_current_user, has_access
from app.models import Company, ManufacturingOrder, Partner, PurchaseOrder, SaleOrder, User
from app.models.enums import ModuleName
from app.schemas import DocumentEmailIn
from app.serializers import company_out, mo_out, purchase_order_out, sale_order_out
from app.services import audit_service, document_service
from app.services.email_service import send_document_email

router = APIRouter(prefix="/api/documents", tags=["documents"])


# --- record loaders (company-scoped) --------------------------------------- #
def _get_sale_order(session: Session, rid: int, company_id: int) -> SaleOrder:
    so = session.get(SaleOrder, rid)
    if not so or so.company_id != company_id:
        raise HTTPException(404, "Sale order not found")
    return so


def _get_purchase_order(session: Session, rid: int, company_id: int) -> PurchaseOrder:
    po = session.get(PurchaseOrder, rid)
    if not po or po.company_id != company_id:
        raise HTTPException(404, "Purchase order not found")
    return po


def _get_mo(session: Session, rid: int, company_id: int) -> ManufacturingOrder:
    mo = session.get(ManufacturingOrder, rid)
    if not mo or mo.company_id != company_id:
        raise HTTPException(404, "Manufacturing order not found")
    return mo


# --- serializer + partner-contact enrichment ------------------------------- #
def _with_partner_contact(session: Session, data: dict, partner_id: int | None) -> dict:
    """Add the partner's postal address + phone so the PDF can print a full
    Bill-To / Ship-To / Vendor block (the list serializers omit these)."""
    partner = session.get(Partner, partner_id) if partner_id else None
    data["partner_phone"] = partner.phone if partner else ""
    data["partner_address"] = partner.address if partner else ""
    return data


def _so_data(session: Session, so: SaleOrder) -> dict:
    return _with_partner_contact(session, sale_order_out(session, so), so.partner_id)


def _po_data(session: Session, po: PurchaseOrder) -> dict:
    return _with_partner_contact(session, purchase_order_out(session, po), po.partner_id)


def _mo_data(session: Session, mo: ManufacturingOrder) -> dict:
    return mo_out(session, mo)


# --- document registry ----------------------------------------------------- #
DOC_TYPES: dict[str, dict] = {
    "sale_order": {
        "module": ModuleName.SALES, "loader": _get_sale_order, "data": _so_data,
        "pdf": document_service.build_sale_order_pdf, "label": "Sale Order",
        "recipient": lambda d: d.get("partner_email"),
    },
    "invoice": {
        "module": ModuleName.SALES, "loader": _get_sale_order, "data": _so_data,
        "pdf": document_service.build_invoice_pdf, "label": "Invoice",
        "recipient": lambda d: d.get("partner_email"),
    },
    "delivery_note": {
        "module": ModuleName.SALES, "loader": _get_sale_order, "data": _so_data,
        "pdf": document_service.build_delivery_note_pdf, "label": "Delivery Note",
        "recipient": lambda d: d.get("partner_email"),
    },
    "purchase_order": {
        "module": ModuleName.PURCHASE, "loader": _get_purchase_order, "data": _po_data,
        "pdf": document_service.build_purchase_order_pdf, "label": "Purchase Order",
        "recipient": lambda d: d.get("partner_email"),
    },
    "mo_traveler": {
        "module": ModuleName.MANUFACTURING, "loader": _get_mo, "data": _mo_data,
        "pdf": document_service.build_mo_traveler_pdf, "label": "MO Traveler",
        "recipient": lambda d: None,  # internal doc — recipient is typed in
    },
}


def _filename(record_name: str, label: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", f"{record_name}-{label}").strip("-")
    return f"{safe or 'document'}.pdf"


def _prepare(doc_type: str, record_id: int, session: Session, user: User):
    """Resolve + authorize + render. Returns (cfg, record, data, pdf_bytes)."""
    cfg = DOC_TYPES.get(doc_type)
    if not cfg:
        raise HTTPException(404, f"Unknown document type '{doc_type}'")
    if not has_access(session, user, cfg["module"], "view"):
        raise HTTPException(403, f"You do not have access to {cfg['module'].value} documents.")
    record = cfg["loader"](session, record_id, user.company_id)
    data = cfg["data"](session, record)
    company = session.get(Company, user.company_id)
    pdf = cfg["pdf"](company_out(company), data)
    return cfg, record, data, pdf


@router.get("/{doc_type}/{record_id}")
def get_document(
    doc_type: str,
    record_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    cfg, record, _data, pdf = _prepare(doc_type, record_id, session, user)
    filename = _filename(record.name, cfg["label"])
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/{doc_type}/{record_id}/email")
def email_document(
    doc_type: str,
    record_id: int,
    body: DocumentEmailIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    cfg, record, data, pdf = _prepare(doc_type, record_id, session, user)
    recipient = (body.to or "").strip() or (cfg["recipient"](data) or "").strip()
    if not recipient:
        raise HTTPException(400, "No recipient email address — add one to send this document.")

    company = session.get(Company, user.company_id)
    filename = _filename(record.name, cfg["label"])
    subject = f"{cfg['label']} {record.name} from {company.name}"
    note = (body.message or "").strip()
    paragraphs = ([note, ""] if note else []) + [
        f"Please find attached {cfg['label']} {record.name} from {company.name}.",
        "",
        f"— {user.full_name or company.name}",
    ]
    sent, detail = send_document_email(recipient, subject, "\n".join(paragraphs), pdf, filename)

    audit_service.log(
        session,
        company_id=user.company_id,
        entity_type="document",
        entity_id=record.id,
        action="emailed",
        description=f"{cfg['label']} {record.name} emailed to {recipient} ({'sent' if sent else 'not sent'})",
        user_id=user.id,
    )
    session.commit()
    return {"sent": sent, "detail": detail, "to": recipient}
