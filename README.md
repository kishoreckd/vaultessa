# Vaultessa

A zero-knowledge password manager for individuals and teams, modelled on Zoho Vault.
Formerly developed under the working name "PassVault".

Current features, validation and remaining work: [project status](docs/12-current-status.md).

> The server never sees your master password, your vault key, or any secret in plaintext.
> All encryption and decryption happens in the client (browser / extension / mobile app).

## Repository layout

```
.
├── backend/            Python 3.12 + FastAPI + SQLAlchemy 2 + Alembic (PostgreSQL) REST API
├── frontend/           React + Vite + TypeScript + Tailwind web vault (Web Crypto API)
├── docs/               Product analysis, architecture, security model, data model, API, roadmap
├── .claude/skills/     Project skills that encode how we build features here
├── docker-compose.yml  Local PostgreSQL (host port 5433) + Mailpit
└── CLAUDE.md           Working rules for AI-assisted development in this repo
```

## Quick start

Prerequisites: Python 3.12, Node.js 20.19+ (tested on 24), Docker.

```powershell
# 1. Infrastructure
docker compose up -d

# 2. Backend  →  http://localhost:8010  (API docs at /api/docs)
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
Copy-Item .env.example .env          # then fill in the two secrets
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8010 --reload

# 3. Frontend (new terminal)  →  http://localhost:5173  (proxies /api to :8010)
cd frontend
npm install
npm run dev
```

## Documentation

| Doc | What it covers |
| --- | --- |
| [docs/01-product-analysis.md](docs/01-product-analysis.md) | Zoho Vault feature breakdown and what we build |
| [docs/02-architecture.md](docs/02-architecture.md) | System architecture, tech stack, folder structure |
| [docs/03-security-model.md](docs/03-security-model.md) | Zero-knowledge crypto design, key hierarchy, threat model |
| [docs/04-data-model.md](docs/04-data-model.md) | Database entities and relationships |
| [docs/05-api-spec.md](docs/05-api-spec.md) | REST API reference |
| [docs/06-roadmap.md](docs/06-roadmap.md) | Phased delivery plan and backlog |
| [docs/07-dev-guide.md](docs/07-dev-guide.md) | Conventions, testing, scripts |
| [docs/08-personas-and-ux.md](docs/08-personas-and-ux.md) | Personas, UX principles, design system |
| [docs/09-competitor-passbolt.md](docs/09-competitor-passbolt.md) | Passbolt feature-by-feature comparison |
| [docs/10-deployment.md](docs/10-deployment.md) | Hosting on Vercel + Railway + Supabase |
| [backend/README.md](backend/README.md) | Backend setup and conventions |

## Status

Phase 0 (foundation) is implemented: account registration/login with client-side key derivation,
encrypted personal vault (CRUD), folders, per-secret sharing via RSA-OAEP, password generator,
password history, audit log, auto-lock. See the [roadmap](docs/06-roadmap.md) for what's next.
