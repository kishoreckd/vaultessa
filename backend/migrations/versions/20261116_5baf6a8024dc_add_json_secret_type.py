"""add JSON vault item type

Revision ID: 5baf6a8024dc
Revises: c5a224ff056d
Create Date: 2026-11-16
"""

from collections.abc import Sequence

from alembic import op

revision: str = "5baf6a8024dc"
down_revision: str | None = "c5a224ff056d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # PostgreSQL enum values must be committed before rows can use them.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE secret_type ADD VALUE IF NOT EXISTS 'JSON'")


def downgrade() -> None:
    # PostgreSQL cannot safely remove an enum value while rows may reference it.
    pass
