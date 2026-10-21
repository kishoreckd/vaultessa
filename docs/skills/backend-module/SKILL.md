---
name: backend-module
description: How to add or change a Vaultessa backend API module or endpoint (Python, FastAPI, Pydantic v2, SQLAlchemy 2). Use when creating routers, services, request/response schemas, authorization checks or audit events in backend/app/modules.
---

# Adding a backend module / endpoint

## File layout
```
backend/app/modules/<feature>/
  __init__.py
  schemas.py   Pydantic models: requests extend RequestModel, responses extend ApiModel
  service.py   business logic + SQLAlchemy + authorization; raises AppError; NEVER commits
  router.py    APIRouter: parse → service → audit.record → db.commit → return
```
Register the router in `backend/app/main.py` (it's mounted under `/api`).

## Steps
1. **Schemas** — `RequestModel` gives camelCase aliases and `extra="forbid"`. Reuse the types in
   `app/core/schema.py`: `EncString`, `EncKey`, `EncName`, `RsaWrappedKey`, `Email`, `Base64Hash`.
   Bound every string (`StringConstraints(max_length=...)`) and int (`Field(ge=..., le=...)`).
2. **Service** — plain functions `(db: Session, user_id: uuid.UUID, ...)`. Authorize first, e.g.
   `require_access(db, user_id, secret_id, Permission.MODIFY)`. Use `db.add`/`db.flush`, never
   `db.commit`. Raise `AppError.not_found()` when the caller has no access at all (don't leak existence),
   `AppError.forbidden()` when access is insufficient.
3. **Router** — protect with the `auth: Auth` dependency and take `db: DbSession` (from `app/core/deps.py`).
   For mutations call `record(db, request, AuditAction.X, user_id=auth.user_id, target_type=..., target_id=...)`
   then `db.commit()` once, so the change and its audit row are atomic. Add new actions to `AuditAction`.
   For `204` return `Response(status_code=204)` explicitly.
4. **Rate limits** — sensitive public routes: `dependencies=[Depends(RateLimiter(...))]` from `app/core/rate_limit.py`.
5. **Docs** — add the endpoint to `docs/05-api-spec.md`.
6. **Tests** — `backend/tests/test_<feature>.py` with the `api` fixture and helpers in `tests/helpers.py`.
   Cover: 401 without token, 404 for another user's resource, 400 validation, happy path.
   Run `.\.venv\Scripts\python.exe -m pytest` and `-m ruff check .`.

## Conventions
- Sync `def` endpoints (FastAPI runs them in a threadpool) — matches SQLAlchemy's sync session.
- Response DTOs never include `auth_hash`, `token_hash`, or other users' wrapped keys.
- Audit action names: `SCREAMING_SNAKE`, `<NOUN>_<VERB>` e.g. `SECRET_CREATE`, `SHARE_REVOKE`.
- Never put secrets, auth hashes or tokens into audit `details` or into logs.
