import asyncio

from fastapi import WebSocket


class ConnectionManager:
    """Tracks live dashboard sockets and broadcasts events to all of them.

    Broadcasting is fire-and-forget and thread-safe: services run in a
    threadpool (sync routes) and schedule the coroutine onto the captured
    main event loop, so a socket hiccup can never sit in a request's
    critical path.
    """

    def __init__(self) -> None:
        self.active: list[WebSocket] = []
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self.active:
            self.active.remove(ws)

    async def _broadcast(self, message: dict) -> None:
        dead: list[WebSocket] = []
        for ws in list(self.active):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    def broadcast_threadsafe(self, message: dict) -> None:
        if self._loop is None:
            return
        try:
            asyncio.run_coroutine_threadsafe(self._broadcast(message), self._loop)
        except Exception:
            # Realtime is best-effort; never let it break the request.
            pass


manager = ConnectionManager()
