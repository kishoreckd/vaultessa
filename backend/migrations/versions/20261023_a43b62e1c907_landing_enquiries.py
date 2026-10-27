"""Add private landing-page enquiries storage."""

import sqlalchemy as sa
from alembic import op

revision = "a43b62e1c907"
down_revision = "20eefbcfb908"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "enquiries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("client_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("category IN ('general', 'teams', 'feedback')", name="ck_enquiry_category"),
    )
    op.create_index("ix_enquiries_client_hash", "enquiries", ["client_hash"])
    op.create_index("ix_enquiries_created_at", "enquiries", ["created_at"])
    op.execute('ALTER TABLE "enquiries" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_table("enquiries")
