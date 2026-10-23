"""Read-only readiness checks. Public results never include database identifiers or secrets."""

from functools import lru_cache
from pathlib import Path

from alembic.script import ScriptDirectory
from alembic.util.exc import CommandError
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.db.session import Base


@lru_cache(maxsize=1)
def expected_migrations() -> frozenset[str]:
    directory = Path(__file__).resolve().parents[2] / "migrations"
    return frozenset(ScriptDirectory(str(directory)).get_heads())


def database_readiness(db: Session) -> dict[str, str]:
    tables = set(inspect(db.connection()).get_table_names())
    schema = "ready" if set(Base.metadata.tables).issubset(tables) else "missing_tables"
    if "alembic_version" not in tables:
        migration = "not_initialized"
    else:
        applied = frozenset(db.execute(text("SELECT version_num FROM alembic_version")).scalars())
        try:
            expected = expected_migrations()
            migration = "up_to_date" if expected and applied == expected else "out_of_date"
        except (OSError, ValueError, CommandError):
            migration = "unknown"
    return {"schema": schema, "migrations": migration}
