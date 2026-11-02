"""Folder identities and recoverable vault deletion."""

import sqlalchemy as sa
from alembic import op

revision = "b24c90d118aa"
down_revision = "a13a55a64682"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("folders", sa.Column("name_fingerprint", sa.String(64), nullable=True))
    op.create_unique_constraint("uq_folder_user_fingerprint", "folders", ["user_id", "name_fingerprint"])
    op.add_column("secrets", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_secrets_deleted_at", "secrets", ["deleted_at"])


def downgrade():
    op.drop_index("ix_secrets_deleted_at", table_name="secrets")
    op.drop_column("secrets", "deleted_at")
    op.drop_constraint("uq_folder_user_fingerprint", "folders", type_="unique")
    op.drop_column("folders", "name_fingerprint")
