from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.events.ws import manager

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Live event feed for the dashboard. Auth-free for demo simplicity;
    it only ever pushes non-sensitive operational events."""
    await manager.connect(websocket)
    try:
        # Greet so the client knows the socket is live.
        await websocket.send_json({"type": "connected", "message": "Live feed connected", "data": {}})
        while True:
            # We don't expect inbound messages; this just keeps the socket open.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
