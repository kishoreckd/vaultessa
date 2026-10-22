"""Add email verification and optional client-encrypted vault recovery.

Revision ID: 01176535d83b
Revises: ed2b9487fd4c
"""

import sqlalchemy as sa
from alembic import op

revision = "01176535d83b"
down_revision = "ed2b9487fd4c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("email_verified", sa.Boolean(), server_default=sa.text("false"), nullable=False)
    )
    for name in ("email_verification_hash", "password_reset_hash"):
        op.add_column("users", sa.Column(name, sa.String(64), nullable=True))
        op.create_index(f"ix_users_{name}", "users", [name])
    for name in (
        "email_verification_expires_at",
        "email_verification_sent_at",
        "password_reset_expires_at",
        "password_reset_sent_at",
    ):
        op.add_column("users", sa.Column(name, sa.DateTime(timezone=True), nullable=True))
    for name in ("recovery_auth_hash", "recovery_wrapped_vault_key"):
        op.add_column("users", sa.Column(name, sa.Text(), nullable=True))
    op.add_column(
        "users", sa.Column("password_reset_attempts", sa.Integer(), server_default="0", nullable=False)
    )


def downgrade() -> None:
    for name in ("email_verification_hash", "password_reset_hash"):
        op.drop_index(f"ix_users_{name}", table_name="users")
    for name in (
        "email_verified",
        "email_verification_hash",
        "email_verification_expires_at",
        "email_verification_sent_at",
        "recovery_auth_hash",
        "recovery_wrapped_vault_key",
        "password_reset_hash",
        "password_reset_expires_at",
        "password_reset_sent_at",
        "password_reset_attempts",
    ):
        op.drop_column("users", name)
