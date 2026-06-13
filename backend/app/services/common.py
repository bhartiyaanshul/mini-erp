from sqlalchemy import func
from sqlmodel import Session, select


def next_seq_name(session: Session, model, prefix: str) -> str:
    """Generate a human-friendly document reference like SO-0001.

    Counts existing rows; gaps from deletions don't matter for a demo.
    """
    count = session.exec(select(func.count()).select_from(model)).one()
    return f"{prefix}-{(count or 0) + 1:04d}"


def fmt_qty(qty: float) -> str:
    """Trim trailing .0 so quantities read cleanly in messages."""
    return f"{qty:g}"
