"""End-to-end encrypted folder sharing."""

import sqlalchemy as sa
from alembic import op

revision = "c35d91e229bb"
down_revision = "b24c90d118aa"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("folders", sa.Column("wrapped_key", sa.Text(), nullable=True))
    op.add_column("folders", sa.Column("shared_name", sa.Text(), nullable=True))
    op.create_table(
        "folder_shares",
        sa.Column("folder_id", sa.Uuid(), sa.ForeignKey("folders.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("wrapped_key", sa.Text(), nullable=False),
        sa.Column("permission", sa.String(16), nullable=False),
        sa.CheckConstraint("permission IN ('VIEW', 'MODIFY')", name="ck_folder_share_permission"),
    )
    op.create_index("ix_folder_shares_user_id", "folder_shares", ["user_id"])
    op.create_table(
        "folder_item_keys",
        sa.Column("secret_id", sa.Uuid(), sa.ForeignKey("secrets.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("folder_id", sa.Uuid(), sa.ForeignKey("folders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("wrapped_key", sa.Text(), nullable=False),
    )
    op.create_index("ix_folder_item_keys_folder_id", "folder_item_keys", ["folder_id"])
    op.execute("ALTER TABLE folder_shares ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE folder_item_keys ENABLE ROW LEVEL SECURITY")


def downgrade():
    op.drop_table("folder_item_keys")
    op.drop_table("folder_shares")
    op.drop_column("folders", "shared_name")
    op.drop_column("folders", "wrapped_key")
