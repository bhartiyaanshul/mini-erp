from datetime import datetime

from sqlmodel import Session, select

from app.models import StockMove
from app.models.enums import MoveSource, MoveState, MoveType


def get_availability(session: Session, product_id: int) -> dict:
    """The one function the entire system depends on.

    Every quantity is derived from the immutable StockMove ledger:
        on_hand     = Σ(done IN) − Σ(done OUT)
        reserved    = Σ(reserved OUT)
        free_to_use = on_hand − reserved
    """
    moves = session.exec(select(StockMove).where(StockMove.product_id == product_id)).all()
    on_hand = 0.0
    reserved = 0.0
    for m in moves:
        if m.state == MoveState.DONE:
            on_hand += m.qty if m.move_type == MoveType.IN else -m.qty
        elif m.state == MoveState.RESERVED and m.move_type == MoveType.OUT:
            reserved += m.qty
    return {
        "on_hand": round(on_hand, 4),
        "reserved": round(reserved, 4),
        "free_to_use": round(on_hand - reserved, 4),
    }


def availability_map(session: Session, product_ids: list[int]) -> dict[int, dict]:
    """Batch availability for list views; avoids an N+1 over the ledger."""
    result = {pid: {"on_hand": 0.0, "reserved": 0.0, "free_to_use": 0.0} for pid in product_ids}
    if not product_ids:
        return result
    moves = session.exec(select(StockMove).where(StockMove.product_id.in_(product_ids))).all()
    for m in moves:
        agg = result.setdefault(
            m.product_id, {"on_hand": 0.0, "reserved": 0.0, "free_to_use": 0.0}
        )
        if m.state == MoveState.DONE:
            agg["on_hand"] += m.qty if m.move_type == MoveType.IN else -m.qty
        elif m.state == MoveState.RESERVED and m.move_type == MoveType.OUT:
            agg["reserved"] += m.qty
    for agg in result.values():
        agg["on_hand"] = round(agg["on_hand"], 4)
        agg["reserved"] = round(agg["reserved"], 4)
        agg["free_to_use"] = round(agg["on_hand"] - agg["reserved"], 4)
    return result


def create_move(
    session: Session,
    *,
    product_id: int,
    qty: float,
    move_type: MoveType,
    source: MoveSource,
    state: MoveState = MoveState.DONE,
    source_doc_id: int | None = None,
    note: str = "",
    done_at: datetime | None = None,
) -> StockMove:
    """The ONLY path that writes stock movements. Flush-only; caller commits.

    `done_at` is normally stamped to now for DONE moves; callers may pass an
    explicit timestamp to backfill dated history (e.g. seeded demand) so the
    ledger reflects when a move actually happened.
    """
    move = StockMove(
        product_id=product_id,
        qty=qty,
        move_type=move_type,
        source=source,
        state=state,
        source_doc_id=source_doc_id,
        note=note,
        done_at=(done_at or datetime.utcnow()) if state == MoveState.DONE else None,
    )
    session.add(move)
    session.flush()
    return move


def complete_move(session: Session, move: StockMove) -> StockMove:
    """Flip a reserved move to done (e.g. delivery, component consumption)."""
    move.state = MoveState.DONE
    move.done_at = datetime.utcnow()
    session.add(move)
    session.flush()
    return move


def reserved_moves_for(session: Session, *, source: MoveSource, source_doc_id: int) -> list[StockMove]:
    return list(
        session.exec(
            select(StockMove).where(
                StockMove.source == source,
                StockMove.source_doc_id == source_doc_id,
                StockMove.state == MoveState.RESERVED,
            )
        ).all()
    )


def moves_for_product(session: Session, product_id: int) -> list[StockMove]:
    return list(
        session.exec(
            select(StockMove)
            .where(StockMove.product_id == product_id)
            .order_by(StockMove.created_at)
        ).all()
    )
