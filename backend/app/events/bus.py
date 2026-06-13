from datetime import datetime

from app.events.ws import manager


def emit(event_type: str, data: dict | None = None, message: str = "") -> None:
    """Publish a domain event to all connected dashboard sockets.

    This is deliberately fire-and-forget — call it freely from services after
    a transaction commits.
    """
    payload = {
        "type": event_type,
        "message": message,
        "data": data or {},
        "ts": datetime.utcnow().isoformat(),
    }
    manager.broadcast_threadsafe(payload)
