import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app.core.config import settings
from app.core.db import engine, init_db
from app.events.ws import manager

# Ensure our app loggers (e.g. mini_erp.email) emit to the console at INFO.
# uvicorn configures its own loggers but not ours, so without this our INFO
# lines would be swallowed and only WARNING+ would surface.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("mini_erp").setLevel(logging.INFO)
logger = logging.getLogger("mini_erp.startup")
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
    public,
    purchase,
    sales,
    seed,
    stock,
    users,
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
    from app.services.email_service import smtp_status

    logger.info(smtp_status())
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
    users,
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
    public,
):
    app.include_router(module.router)

app.include_router(ws.router)
