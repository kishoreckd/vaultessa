---
name: database-migration
description: How to change the Vaultessa database schema safely with SQLAlchemy models and Alembic migrations (add tables/columns, indexes, relations, enum values) and keep docs in sync. Use when editing backend/app/models.py or backend/migrations.
---

# Changing the schema

1. Edit `backend/app/models.py`.
   - Ids: `id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)`.
   - User content → `encrypted_<name>: Mapped[str] = mapped_column(Text)` (ciphertext, see `zero-knowledge-crypto`).
   - Every FK gets an explicit `ondelete=` and an index if you filter by it.
   - Timestamps: `created_at_column()` / `updated_at_column()` helpers.
2. Make sure Postgres is up: `docker compose up -d` (repo root, host port 5433).
3. In `backend/`: `.\.venv\Scripts\python.exe -m alembic revision --autogenerate -m "<what changed>"`.
4. Review the generated file in `migrations/versions/`:
   - Adding a NOT NULL column to a populated table needs `server_default` or a backfill step.
   - Renames show up as drop + add — rewrite with `op.alter_column(..., new_column_name=...)` to keep data.
   - New Postgres enum values need `op.execute("ALTER TYPE ... ADD VALUE ...")` — autogenerate misses them.
   - Dropped enum columns: drop the enum type in `downgrade()`/`upgrade()` explicitly.
5. `.\.venv\Scripts\python.exe -m alembic upgrade head`, then `-m pytest` (tests rebuild the test DB through
   the migrations, so a broken migration fails the suite).
6. Update `docs/04-data-model.md`.

Never edit a migration that has already been applied in a shared environment; add a new one.
