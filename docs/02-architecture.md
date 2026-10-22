# 02 — Architecture

## 1. System overview

```
┌──────────────────────────┐        HTTPS (JSON, ciphertext only)       ┌───────────────────────┐
│ Clients                  │  ───────────────────────────────────────▶  │ API (FastAPI, Python) │
│  • Web vault (React)     │                                            │  • auth / sessions    │
│  • Browser ext. (P3)     │  ◀───────────────────────────────────────  │  • secrets / folders  │
│  • Mobile (P3)           │       access token (JWT) + refresh cookie   │  • sharing / audit    │
│                          │                                            └──────────┬────────────┘
│  Crypto lives HERE:      │                                                       │ SQLAlchemy
│  PBKDF2, HKDF, AES-GCM,  │                                            ┌──────────▼────────────┐
│  RSA-OAEP (Web Crypto)   │                                            │ PostgreSQL            │
└──────────────────────────┘                                            └───────────────────────┘
                                         later: Redis (rate limits, jobs), S3 (attachments), SMTP
```

The API is a **ciphertext store with access control**. It authenticates users, enforces who may read
or change which encrypted blob, and records audit events. It cannot decrypt anything.

## 2. Tech stack and why

| Layer | Choice | Reason |
| --- | --- | --- |
| API runtime | Python 3.12 | Team standard (same stack as Spendova) |
| Web framework | FastAPI | Typed request/response models, dependency injection for auth, OpenAPI docs for free |
| Validation | Pydantic v2 | Schemas validate input and serialise output (camelCase on the wire) |
| ORM / migrations | SQLAlchemy 2 (sync) + Alembic | Mature, typed `Mapped[]` models, reviewed migrations |
| Database | PostgreSQL 16 | Relational integrity for access control, JSONB for audit metadata |
| Server-side password hashing | `hashlib.scrypt` (stdlib) | Hashes the client's auth hash; no native extras |
| Tokens | PyJWT access token (15 min) + opaque refresh token (httpOnly cookie, DB-backed) | Revocable sessions |
| Web client | React 19 + Vite + TypeScript | Fast DX, large ecosystem |
| Styling | Tailwind CSS 4 | Consistent design tokens, no CSS sprawl |
| Client state | Zustand (session/keys, memory only) + TanStack Query (server data) | Keys never persisted |
| Client crypto | Web Crypto API (`crypto.subtle`) | Audited native implementation, non-extractable keys |
| Tests | pytest (backend, real Postgres) + Vitest (frontend) | |
| Lint/format | ruff (backend), tsc strict (frontend) | |
| Local infra | Docker Compose (Postgres, Mailpit) | One command setup |

## 3. Folder structure

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

Frontend features remain under `frontend/src/features/`, with shared crypto in `lib/crypto/`, API access in `lib/api/`, and shared UI in `components/`.

**Layer rule:** HTTP handlers live in `api`, validation in `schemas`, and business logic in `services`. Cross-feature calls use services, never routers. Database mappings live in `db/models`; shared enums live in `constants/vault.py`. `main.py` only exposes the ASGI app.

## 4. Request lifecycle (backend)

1. CORS middleware and a security-headers middleware (`nosniff`, `DENY` framing, `no-store`, strict CSP,
   HSTS in production) wrap every request; a global per-IP rate limit applies to all routes.
2. Protected routes depend on `Auth` (`app/core/deps.py`), which verifies the JWT **and** checks the
   session row still exists, so logout/revocation takes effect immediately.
3. FastAPI validates the body against a Pydantic `RequestModel` (unknown fields rejected) →
   failures become `400 VALIDATION_ERROR` without echoing input.
4. The service authorizes (e.g. permission ≥ `MODIFY`) and writes via the request's session.
5. The router adds an `AuditLog` row and commits once — change and audit entry are atomic.
6. `AppError` → `{ "error": { "code", "message" } }`; unknown exceptions → 500, logged without bodies.

## 5. Client lifecycle

1. **Boot:** try `POST /auth/refresh` (cookie). Success → `/unlock` (keys still needed). Fail → `/login`.
2. **Login / unlock:** derive keys from master password → unwrap vault key and private key → keep
   them only in memory (Zustand, no `persist`).
3. **Vault:** fetch ciphertext list → unwrap each secret key → decrypt payloads → render/search.
4. **Lock:** inactivity timer or manual lock wipes keys from memory; reload also locks.

## 6. Deployment (target)

- API: container image (non-root, healthcheck), ≥ 2 replicas behind a TLS-terminating load balancer;
  stateless. Run `alembic upgrade head` as a release step before rolling out.
- DB: managed Postgres with PITR backups, encrypted at rest.
- Web: static build on a CDN with strict CSP (`script-src 'self'`), HSTS, no third-party scripts.
- Secrets: JWT and prelogin secrets from a secret manager, rotated.
- Rate limiting: move the in-process limiter to Redis before running more than one replica (P1).
- Observability: structured JSON logs without bodies; metrics + tracing via OpenTelemetry (P2).
