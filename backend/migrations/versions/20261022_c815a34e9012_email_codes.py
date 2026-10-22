"""Add bounded, purpose-bound email code challenges.

Revision ID: c815a34e9012
Revises: 2bbd70a2d3c2
"""

import sqlalchemy as sa
from alembic import op

revision = "c815a34e9012"
down_revision = "2bbd70a2d3c2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email_verification_code_hash", sa.String(64), nullable=True))
    op.add_column(
        "users", sa.Column("email_verification_code_expires_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "users", sa.Column("email_verification_attempts", sa.Integer(), server_default="0", nullable=False)
    )
    op.add_column("users", sa.Column("password_reset_code_hash", sa.String(64), nullable=True))
    op.add_column(
        "users", sa.Column("password_reset_code_expires_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    for name in (
        "password_reset_code_expires_at",
        "password_reset_code_hash",
        "email_verification_attempts",
        "email_verification_code_expires_at",
        "email_verification_code_hash",
    ):
        op.drop_column("users", name)
