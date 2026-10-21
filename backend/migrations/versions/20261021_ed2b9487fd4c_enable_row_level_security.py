"""enable row level security

Defense in depth for hosted Postgres (e.g. Supabase, whose Data API exposes the `public` schema to
its `anon` / `authenticated` roles). RLS is enabled with NO policies, so those roles get nothing.
The application connects as the table owner, which bypasses RLS, so app behaviour is unchanged.

Revision ID: ed2b9487fd4c
Revises: be0f61fa7e58
Create Date: 2026-10-21 13:36:24.330698
"""

from collections.abc import Sequence

from alembic import op

revision: str = "ed2b9487fd4c"
down_revision: str | None = "be0f61fa7e58"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = (
    "users",
    "sessions",
    "folders",
    "secrets",
    "secret_accesses",
    "secret_history",
    "audit_logs",
    "external_shares",
    "api_tokens",
    "api_token_grants",
    "alembic_version",
)


def upgrade() -> None:
    for table in TABLES:
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    for table in TABLES:
        op.execute(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY')
