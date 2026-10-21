# Vaultessa API

FastAPI backend for Vaultessa: a zero-knowledge ciphertext store with access control.
It authenticates users, enforces who may read or change which encrypted blob, and records audit
events. It never sees plaintext secrets or keys — see `../docs/03-security-model.md`.

## Local setup

```powershell
# from the repo root: Postgres on host port 5433
docker compose up -d

cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
Copy-Item .env.example .env        # then set JWT_ACCESS_SECRET and PRELOGIN_SECRET
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8010 --reload
```

Interactive API docs: `http://127.0.0.1:8010/api/docs` (disabled in production).
The web vault's Vite dev server proxies `/api` to port 8010.

## Quality checks

```powershell
.\.venv\Scripts\python.exe -m pytest           # needs Postgres; DB tests skip if it's down
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format .
```

Tests build a fresh `passvault_test` database **through the Alembic migrations**, so a broken
migration fails the suite. Override the target with `TEST_DATABASE_URL`.

## Schema changes

```powershell
.\.venv\Scripts\python.exe -m alembic revision --autogenerate -m "describe change"
# review the file in migrations/versions/, then:
.\.venv\Scripts\python.exe -m alembic upgrade head
```

## Layout

```
app/
  main.py             create_app(): middleware, error handlers, routers under /api
  config.py           pydantic-settings; secrets are required (fails closed)
  database.py         engine, SessionLocal, Base, get_db
  models.py           SQLAlchemy models + enums
  core/               errors, security (scrypt/JWT), schema base types, auth dependency, rate limiting
  modules/<feature>/  schemas.py (pydantic) → service.py (logic, no commit) → router.py (HTTP, audit, commit)
migrations/           Alembic
tests/                pytest; helpers.py has user/secret factories
```

## Conventions
- Request bodies extend `RequestModel` (camelCase, unknown fields rejected); responses extend `ApiModel`.
- Services raise `AppError` and never commit; routers add the audit row and commit once, so the change
  and its audit entry are atomic.
- No access to a resource → 404; insufficient permission → 403.
