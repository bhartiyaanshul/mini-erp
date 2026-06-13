from collections.abc import Generator
from pathlib import Path
from urllib.parse import urlparse

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

# check_same_thread is a SQLite-only flag; harmless to pass conditionally.
connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

if settings.DATABASE_URL.startswith("sqlite"):
    parsed = urlparse(settings.DATABASE_URL)
    db_path = parsed.path
    if db_path and db_path not in (":memory:", "/:memory:"):
        Path(db_path).expanduser().parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(settings.DATABASE_URL, echo=False, connect_args=connect_args)


def init_db() -> None:
    # Importing the models package registers every table on SQLModel.metadata.
    import app.models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _ensure_sqlite_columns()


def _ensure_sqlite_columns() -> None:
    """Small demo-friendly migration shim for SQLite.

    SQLModel's `create_all` creates missing tables but does not add columns to
    an existing hackathon demo database. These optional planning fields are safe
    to add in place, keeping old seeded DBs usable.
    """
    if not settings.DATABASE_URL.startswith("sqlite"):
        return
    additions = {
        "saleorder": {"promise_date": "DATETIME"},
        "purchaseorder": {"expected_receipt_date": "DATETIME"},
        "manufacturingorder": {"planned_start": "DATETIME", "planned_finish": "DATETIME"},
    }
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, columns in additions.items():
            if table not in existing_tables:
                continue
            existing_columns = {col["name"] for col in inspector.get_columns(table)}
            for name, ddl_type in columns.items():
                if name not in existing_columns:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl_type}"))


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
