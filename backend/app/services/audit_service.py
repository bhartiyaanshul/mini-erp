from sqlmodel import Session, desc, select

from app.models import AuditLog


def log(
    session: Session,
    *,
    company_id: int,
    entity_type: str,
    entity_id: int | None,
    action: str,
    description: str = "",
    user_id: int | None = None,
    payload: dict | None = None,
) -> AuditLog:
    """Append an audit entry. Flush-only; the caller owns the commit."""
    entry = AuditLog(
        company_id=company_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        description=description,
        user_id=user_id,
        payload=payload or {},
    )
    session.add(entry)
    session.flush()
    return entry


def list_logs(
    session: Session, *, company_id: int, entity_type: str | None = None, limit: int = 200
) -> list[AuditLog]:
    stmt = select(AuditLog).where(AuditLog.company_id == company_id)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    stmt = stmt.order_by(desc(AuditLog.created_at)).limit(limit)
    return list(session.exec(stmt).all())
