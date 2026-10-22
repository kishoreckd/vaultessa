# 07 — Developer Guide

## Scripts

Backend commands run from `backend/` with the venv's interpreter: `.\.venv\Scripts\python.exe -m <tool>`.

| Where | Command | Does |
| --- | --- | --- |
| root | `docker compose up -d` | Postgres (host 5433) + Mailpit (UI 8026, SMTP 1026). Override with `POSTGRES_PORT`, `MAILPIT_UI_PORT`, `MAILPIT_SMTP_PORT` |
| backend | `uvicorn app.main:app --port 8010 --reload` | API with reload on :8010, docs at `/api/docs` |
| backend | `alembic revision --autogenerate -m "..."` | Generate a migration from `app/db/models/` |
| backend | `alembic upgrade head` | Apply migrations |
| backend | `pytest` | Unit + integration tests (real Postgres `passvault_test`) |
| backend | `ruff check .` / `ruff format .` | Lint / format |
| frontend | `npm run dev` | Vite on :5173, proxies `/api` → :8010 |
| frontend | `npm run typecheck` / `npm test` / `npm run build` | |
| frontend | `npm run seed:demo` | Creates `demo@vaultessa.dev` / `Demo-Vault-2026!` with every item type, health issues and shares from `meera@vaultessa.dev` (dev only) |

Port 8010 (not FastAPI's usual 8000) lets Vaultessa run alongside other local FastAPI apps.

## Conventions

- **Python**: type hints everywhere, ruff clean, sync SQLAlchemy sessions in sync endpoints.
- **TypeScript strict** in the frontend. No `any` without a comment explaining why.
- **Backend layers**: `schemas.py` (Pydantic) → `service.py` (logic, SQLAlchemy, authorization,
  raises `AppError`, never commits) → `router.py` (HTTP, audit, single commit).
- **API casing**: snake_case in Python, camelCase on the wire via `ApiModel`/`RequestModel` aliases.
- **Frontend features**: one folder per feature; API calls via `lib/api/*`; all crypto via
  `lib/crypto/*`. Components never call `crypto.subtle` directly.
- **Errors**: user-facing messages must not reveal whether an email exists.
- **Logging**: never log bodies of auth/secret routes; never log tokens, keys or auth hashes.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).

## Testing strategy

| Level | Tool | Scope |
| --- | --- | --- |
| Unit | pytest / Vitest | server hashing & tokens; client crypto round-trips, generator |
| Integration | pytest + `TestClient` against Postgres built via Alembic | auth, permissions matrix, sharing, concurrency |
| Contract | real-crypto smoke script (frontend crypto ↔ live API) | end-to-end key hierarchy |
| E2E (P1) | Playwright | register → add secret → share → recipient sees it |

Crypto changes **must** include a round-trip test and a test that a wrong key fails.

## Project skills

`.claude/skills/` contains repeatable recipes used when building features with Claude Code:

| Skill | Use when |
| --- | --- |
| `zero-knowledge-crypto` | Touching anything that encrypts, decrypts, derives or wraps keys |
| `backend-module` | Adding/changing an API module or endpoint |
| `frontend-feature` | Adding a page, feature, or API hook in the web vault |
| `ux-personas` | Designing any screen, flow or copy (personas, design system, accessibility) |
| `database-migration` | Changing the database schema (SQLAlchemy + Alembic) |
| `security-checklist` | Before finishing any feature (review gate) |
