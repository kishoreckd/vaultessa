<div align="center">

<img src="frontend/public/brand/vaultessa-mark.svg" alt="" width="72" height="72">

# Vaultessa

**A zero-knowledge password manager for individuals and teams.**

Passwords, notes and keys are encrypted in your browser before they leave your device.
The server stores only ciphertext and can never read your vault.

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)

</div>

---

## Contents

- [Features](#features)
- [Security model](#security-model)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Testing](#testing)
- [Deployment](#deployment)
- [Developer access (CLI & SDKs)](#developer-access-cli--sdks)
- [Documentation](#documentation)
- [Project status](#project-status)
- [Reporting a vulnerability](#reporting-a-vulnerability)
- [License](#license)

## Features

**Vault**
- Nine item types: logins, secure notes, payment cards, identities, bank accounts, SSH keys,
  API keys, Wi-Fi networks and servers
- Folders, favourites, search, keyboard shortcuts and quick copy
- Version history for every item, plus expiry reminders by email
- Password health: weak, reused and old passwords, with opt-in breach checks
- Password and passphrase generator with selectable character groups
- CSV import (Chrome format) and encrypted backup export / restore

**Sharing**
- Share with other Vaultessa users at four levels: *Login only*, *View*, *Edit* and *Manage*
- Secure share links for anyone, with no account needed: one-time or time-limited, view limits,
  optional access code, email delivery, revoke and re-open the same link
- Flags for shares outside your organisation's domain, plus link activity and view tracking

**Account security**
- Master password never leaves the browser (PBKDF2-SHA256, 600,000 iterations)
- Two-step verification with an authenticator app (Google Authenticator, Microsoft Authenticator,
  1Password, …) and single-use recovery codes
- "Remember this device" for 30 days. It skips only the two-step code, never the master password.
- Email verification and opt-in account recovery with six-digit email codes and a saved recovery key
- Brute-force protection: account lockout, rate limiting and a 2-hour block after repeated wrong codes
- Device and session management, master-password change and security email alerts

**Teams**
- Organisations with owner, admin and member roles, plus email invitations
- DNS-verified company domains, team-scoped item grants and membership deactivation

**Platform**
- Durable email outbox: every email is recorded and retried after outages, and expired codes are never sent late
- Machine tokens, a CLI and Node / Python SDKs for pulling secrets into CI/CD pipelines
- Light and dark themes that follow the system, an installable web app and accessible, keyboard-friendly UI

## Security model

Vaultessa follows a **zero-knowledge** design: the server can authenticate you but can never
decrypt your data.

```
master password ──PBKDF2-SHA256──▶ master key
   ├─ HKDF ─▶ auth hash ──▶ server (stored only as an scrypt hash)
   └─ HKDF ─▶ key-encryption key ──▶ unwraps your vault key (AES-256-GCM)
vault key ─▶ wraps a unique AES-256-GCM key for every item
RSA-OAEP-3072 key pair ─▶ end-to-end sharing between users
```

- All cryptography runs in the browser via the Web Crypto API. Decrypted data and keys live
  only in memory and are never written to storage, URLs or logs.
- Share-link keys travel in the URL fragment (`#…`), which browsers never send to the server.
- Server-side secrets (such as authenticator seeds) are sealed with AES-256-GCM at rest.
- Postgres row-level security is enabled on every table, so a hosted database's data API
  exposes nothing.

Full design, key hierarchy and threat model: [docs/03-security-model.md](docs/03-security-model.md).

## Tech stack

| Layer | Technology |
| --- | --- |
| Web app | React 19, Vite, TypeScript, Tailwind CSS 4, shadcn/ui (Radix), TanStack Query, Zustand |
| API | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic |
| Database | PostgreSQL 16 |
| Crypto | Web Crypto API (browser); `cryptography` and scrypt (server) |
| Email | SMTP (Brevo in production, Mailpit locally) with a retrying outbox |
| Hosting | Vercel (web), Railway (API), Supabase (PostgreSQL) |

## Repository layout

```
.
├── backend/            FastAPI service: api/, services/, schemas/, db/, core/ + Alembic migrations
├── frontend/           React web app (vault, sharing, settings, public pages)
├── packages/           CLI and SDKs for machine access (sdk-js, sdk-python)
├── docs/               Architecture, security, data model, API, deployment and design notes
└── docker-compose.yml  Local PostgreSQL (port 5433) and Mailpit test inbox (port 8026)
```

## Getting started

**Prerequisites:** Python 3.12, Node.js 20.19+, Docker.

```powershell
# 1. Database and test inbox
docker compose up -d

# 2. API  →  http://127.0.0.1:8010
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
Copy-Item .env.example .env        # then fill in the three secrets (see Configuration)
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8010 --reload

# 3. Web app (new terminal)  →  http://127.0.0.1:5173
cd frontend
npm install
npm run dev
```

The web app proxies `/api` to the backend. Emails sent during development appear in Mailpit at
<http://127.0.0.1:8026>.

**Demo data (optional):** with the API running, run `npm run seed:demo` in `frontend/` and sign in
as `demo@vaultessa.dev` / `Demo-Vault-2026!`.

## Configuration

All backend settings are environment variables, documented in
[`backend/.env.example`](backend/.env.example) (local) and
[`backend/.env.production.example`](backend/.env.production.example) (production).

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection (`postgresql+psycopg://…`) |
| `JWT_ACCESS_SECRET`, `PRELOGIN_SECRET`, `MFA_ENCRYPTION_KEY` | Three independent random secrets. Generate each with `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `APP_BASE_URL`, `CORS_ORIGINS` | Public web-app URL used in emails and allowed browser origins |
| `SMTP_*` | Outgoing email (Mailpit locally, Brevo or any SMTP provider in production) |
| `ENABLE_API_DOCS`, `SWAGGER_USERNAME`, `SWAGGER_PASSWORD` | Optional password-protected API docs at `/api/docs` |

The web app needs only `VITE_API_BASE_PATH=/api` (see [`frontend/.env.example`](frontend/.env.example)).
Never put credentials in `VITE_*` variables, because they are embedded in the browser bundle.

> Never commit `.env` or `.env.production`. Both are git-ignored.

## Testing

```powershell
# Backend: needs the Docker database running, or database tests are skipped
cd backend
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m ruff check .

# Web app
cd frontend
npm run typecheck
npm test
npm run build

# SDKs
node --test packages/sdk-js/test.mjs
backend\.venv\Scripts\python.exe packages/sdk-python/test_sdk.py
```

Backend tests run against a real PostgreSQL database built through the Alembic migrations.

## Deployment

| Component | Platform | Notes |
| --- | --- | --- |
| Web app | Vercel | Root `frontend/`; `vercel.json` rewrites `/api/*` to the API (same-origin cookies) |
| API | Railway | Uses `backend/Dockerfile`; runs `alembic upgrade head` before each deploy |
| Database | Supabase | Session pooler URL with `sslmode=require` |

Step-by-step guide and environment checklist: [docs/10-deployment.md](docs/10-deployment.md).

## Developer access (CLI & SDKs)

Create an expiring, item-scoped token under **Developer access**, then pull secrets in CI:

```powershell
$env:VAULTESSA_URL = "https://your-vaultessa-host"
$env:VAULTESSA_TOKEN = "<token from your CI secret store>"
node packages/sdk-js/cli.mjs run --map API_TOKEN=ITEM_ID:fields.token -- node build.mjs
```

Items are decrypted locally by the client. See [packages/README.md](packages/README.md) for the CLI,
the Node and Python SDKs and GitHub Actions masking.

## Documentation

| Topic | Document |
| --- | --- |
| Product analysis | [01-product-analysis](docs/01-product-analysis.md) |
| Architecture | [02-architecture](docs/02-architecture.md) |
| Security model | [03-security-model](docs/03-security-model.md) |
| Data model | [04-data-model](docs/04-data-model.md) |
| API reference | [05-api-spec](docs/05-api-spec.md) |
| Roadmap | [06-roadmap](docs/06-roadmap.md) |
| Development guide | [07-dev-guide](docs/07-dev-guide.md) |
| Personas & UX | [08-personas-and-ux](docs/08-personas-and-ux.md) |
| Competitor comparison | [09-competitor-passbolt](docs/09-competitor-passbolt.md) |
| Deployment | [10-deployment](docs/10-deployment.md) |
| Email delivery & design | [11-email-delivery](docs/11-email-delivery.md), [14-email-design](docs/14-email-design.md) |
| Verification & recovery | [13-email-verification-and-recovery](docs/13-email-verification-and-recovery.md) |
| Organisations & teams | [17-organisations-and-teams](docs/17-organisations-and-teams.md) |
| Backend reference | [backend/README.md](backend/README.md) |

## Project status

Vaultessa is in **active development**. The personal vault, sharing, two-step verification, teams
foundation and developer access are implemented. Planned next: SSO (Google / OIDC), directory sync,
browser extension with autofill, passkey unlock, and mobile and desktop apps.

Current status and known gaps: [docs/12-current-status.md](docs/12-current-status.md).

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Report them privately through
GitHub's **Security → Report a vulnerability** on this repository. Include steps to reproduce,
and we will respond as quickly as possible.

## License

Copyright © 2026 Vaultessa. All rights reserved.
This repository is not currently licensed for public use, modification or distribution.
