import os
from pathlib import Path

# Must be set before the app (and its settings/engine) is imported.
os.environ["ENVIRONMENT"] = "test"
os.environ["APP_BASE_URL"] = "http://127.0.0.1:5173"
os.environ["CORS_ORIGINS"] = "http://127.0.0.1:5173,http://localhost:5173"
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://passvault:passvault@localhost:5433/passvault_test"
)
os.environ["JWT_ACCESS_SECRET"] = "test-access-secret-that-is-at-least-32-chars"
os.environ["PRELOGIN_SECRET"] = "test-prelogin-secret-that-is-at-least-32-chars"
os.environ["MFA_ENCRYPTION_KEY"] = "test-mfa-encryption-key-that-is-at-least-32-chars"
os.environ["RATE_LIMIT_ENABLED"] = "false"
# Never send real email from tests (overrides values from a local .env).
os.environ["SMTP_HOST"] = ""
os.environ["EXPIRY_REMINDERS_ENABLED"] = "false"
os.environ["EMAIL_OUTBOX_WORKER_ENABLED"] = "false"

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.exc import OperationalError  # noqa: E402

from app.db.session import Base, engine
from app.main import app

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _ensure_database(url: str) -> None:
    target = make_url(url)
    admin = create_engine(target.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as conn:
            exists = conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": target.database})
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{target.database}"'))
    finally:
        admin.dispose()


@pytest.fixture(scope="session")
def database():
    """Fresh schema built by the real Alembic migrations (so migrations are tested too)."""
    try:
        _ensure_database(os.environ["DATABASE_URL"])
    except OperationalError as exc:
        pytest.skip(f"PostgreSQL not reachable — run `docker compose up -d` ({exc.orig})")

    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")
    yield


@pytest.fixture
def api(database):
    """HTTP client against an emptied database."""
    tables = ", ".join(table.name for table in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} CASCADE"))
    with TestClient(app) as client:
        yield client


@pytest.fixture
def client():
    """HTTP client for tests that never reach the database."""
    with TestClient(app) as test_client:
        yield test_client
