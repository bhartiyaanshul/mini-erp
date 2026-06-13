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

    SQLModel's `create_all` creates missing tables (Company, UserModuleAccess,
    SignupRequest) but does not add columns to existing tables. We add the
    multi-company + identity columns in place (nullable, so ALTER works on
    populated tables) and backfill everything to the default company (id 1).
    For a clean slate you can simply delete the sqlite file and re-seed.
    """
    if not settings.DATABASE_URL.startswith("sqlite"):
        return
    company_tables = (
        "user",
        "partner",
        "product",
        "bom",
        "saleorder",
        "purchaseorder",
        "manufacturingorder",
        "stockmove",
        "auditlog",
    )
    additions = {
        "saleorder": {"promise_date": "DATETIME", "company_id": "INTEGER"},
        "purchaseorder": {"expected_receipt_date": "DATETIME", "company_id": "INTEGER"},
        "manufacturingorder": {
            "planned_start": "DATETIME",
            "planned_finish": "DATETIME",
            "company_id": "INTEGER",
        },
        "partner": {"company_id": "INTEGER"},
        "product": {"company_id": "INTEGER"},
        "bom": {"company_id": "INTEGER"},
        "stockmove": {"company_id": "INTEGER"},
        "auditlog": {"company_id": "INTEGER"},
        "user": {
            "company_id": "INTEGER",
            "username": "VARCHAR",
            "is_system_admin": "BOOLEAN",
            "address": "VARCHAR",
            "position": "VARCHAR",
            "mobile_number": "VARCHAR",
            "photo": "TEXT",
        },
    }
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        added: set[str] = set()
        for table, columns in additions.items():
            if table not in existing_tables:
                continue
            existing_columns = {col["name"] for col in inspector.get_columns(table)}
            for name, ddl_type in columns.items():
                if name not in existing_columns:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl_type}"))
                    added.add(f"{table}.{name}")

        # Backfill the default company on any pre-existing rows.
        for table in company_tables:
            if table in existing_tables:
                conn.execute(text(f"UPDATE {table} SET company_id = 1 WHERE company_id IS NULL"))

        # Carry old role semantics forward: admins/owners become System Admins.
        if "user" in existing_tables:
            user_cols = {col["name"] for col in inspector.get_columns("user")}
            if "role" in user_cols:
                conn.execute(
                    text(
                        "UPDATE user SET is_system_admin = 1 "
                        "WHERE is_system_admin IS NULL AND role IN ('admin', 'owner')"
                    )
                )
            conn.execute(text("UPDATE user SET is_system_admin = 0 WHERE is_system_admin IS NULL"))


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
