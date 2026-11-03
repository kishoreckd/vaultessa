"""Folder snapshot links and expiring folder memberships."""

import sqlalchemy as sa
from alembic import op

revision = "d46ea2f33acc"
down_revision = "c35d91e229bb"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("folder_shares", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("external_shares", sa.Column("folder_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_external_share_folder", "external_shares", "folders", ["folder_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_external_shares_folder_id", "external_shares", ["folder_id"])
    op.add_column("external_shares", sa.Column("kind", sa.String(16), nullable=False, server_default="item"))
    op.create_check_constraint("ck_external_share_kind", "external_shares", "kind IN ('item', 'folder')")
    op.create_table(
        "external_share_sources",
        sa.Column(
            "share_id", sa.Uuid(), sa.ForeignKey("external_shares.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column("secret_id", sa.Uuid(), sa.ForeignKey("secrets.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_index("ix_external_share_sources_secret_id", "external_share_sources", ["secret_id"])
    op.execute("ALTER TABLE external_share_sources ENABLE ROW LEVEL SECURITY")


def downgrade():
    op.drop_table("external_share_sources")
    op.drop_constraint("ck_external_share_kind", "external_shares", type_="check")
    op.drop_column("external_shares", "kind")
    op.drop_index("ix_external_shares_folder_id", table_name="external_shares")
    op.drop_constraint("fk_external_share_folder", "external_shares", type_="foreignkey")
    op.drop_column("external_shares", "folder_id")
    op.drop_column("folder_shares", "expires_at")
