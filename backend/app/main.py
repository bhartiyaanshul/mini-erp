import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app.core.config import settings
from app.core.db import engine, init_db
from app.events.ws import manager
from app.routers import (
    assistant,
    audit,
    auth,
    bom,
    dashboard,
    forecast,
    manufacturing,
    partners,
    products,
    purchase,
    sales,
    seed,
    stock,
    ws,
)
from app.services.seed_service import ensure_default_users


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # Capture the running loop so sync services can broadcast WS events safely.
    manager.set_loop(asyncio.get_running_loop())
    with Session(engine) as session:
        ensure_default_users(session)
    yield


app = FastAPI(title="Mini ERP — Shiv Furniture Works", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok", "service": "mini-erp"}


for module in (
    auth,
    products,
    partners,
    stock,
    bom,
    sales,
    purchase,
    manufacturing,
    dashboard,
    forecast,
    assistant,
    audit,
    seed,
):
    app.include_router(module.router)

app.include_router(ws.router)
