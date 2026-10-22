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
  main.py                    ASGI entry point only
  core/application.py        application factory, lifecycle, middleware, router registration
  core/                      configuration, auth dependencies, errors, security, rate limits
  constants/                 vault enums, permission ranks, email theme and artwork mappings
  db/session.py              engine, SessionLocal, Base, get_db
  db/model_helpers.py        shared timestamp defaults
  db/models/<name>_model.py   one SQLAlchemy model per file
  api/<feature>.py           HTTP routes, audit, commit
  services/                  business logic, notifications, email configuration and delivery
  schemas/                   Pydantic request and response types
  utils/templates/emails/    shared layout and purpose-specific HTML templates
  static/email/              brand and contextual PNG illustrations
  email_previews/            generated HTML gallery
migrations/                  Alembic
tests/                      pytest
scripts/                     local email preview generator
```

## Conventions
- Request bodies extend `RequestModel` (camelCase, unknown fields rejected); responses extend `ApiModel`.
- Services raise `AppError` and never commit; routers add the audit row and commit once, so the change
  and its audit entry are atomic.
- No access to a resource → 404; insufficient permission → 403.

## Teams and local mail checks

The web app now includes `/teams` for organisation creation, verified-email invitations, membership roles, ownership transfer and optional DNS-verified domain joining. Item sharing supports optional team scope. See [teams](../docs/17-organisations-and-teams.md).

Run `.venv\Scripts\python.exe scripts/verify_local_email.py` for development-only Mailpit integration checks. It refuses non-loopback SMTP/inbox destinations and sends only fictional example messages. Firebase SMS is deferred.

### Shared JSON response format

All JSON API output uses `{ status, message, data }` through
`app/utils/validation/json_validator.py`. Return domain DTOs from handlers normally;
FastAPI filters/validates them before `ApiJSONResponse` wraps the response. Use
`JsonResponse.success/error` for explicit responses, preserving status, headers
and background tasks. For errors, machine-readable codes live in `data.code`.
Keep HTTP 204 bodyless; do not wrap service return values or the OpenAPI document.
The frontend and both repository SDKs unwrap this envelope. See `docs/05-api-spec.md`.
