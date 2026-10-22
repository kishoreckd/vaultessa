# 10 — Deployment: Vercel + Railway + Supabase

```
Browser ──► Vercel (frontend, static React build)
              │  /api/*  rewritten (same origin → secure cookies just work)
              ▼
            Railway (FastAPI container, backend/Dockerfile)
              │  SSL
              ▼
            Supabase (PostgreSQL only — we don't use Supabase Auth/Storage)
```

## 1. Supabase (database)
1. Create a project (pick the region closest to your users, e.g. Mumbai).
2. **Project Settings → Database → Connection string → Session pooler** (works over IPv4 from Railway). Copy the URI and append `?sslmode=require`:
   `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require`
3. Security: Supabase exposes the `public` schema through its Data API. Our migration
   `enable_row_level_security` turns RLS on for every table with no policies, so that API returns nothing.
   For extra safety you can also disable the Data API (Project Settings → API).

## 2. Railway (backend)
Use [`backend/.env.production.example`](../backend/.env.production.example) as the grouped
production variable reference. Fill the required blanks in the hosting service's environment
variables; never commit a populated file. The Docker image does not copy `.env` files.
For a standalone server, put the completed configuration in `backend/.env` instead.
`Settings` reads `backend/.env`; it does not automatically select `.env.production`.
Process environment variables take precedence. Restart/redeploy after changing them.

1. New project → **Deploy from GitHub repo** → choose the repo → set **Root Directory = `backend`**.
   `backend/railway.json` makes Railway build the Dockerfile, run `alembic upgrade head` before each deploy, and health-check `/api/health`.
2. **Variables** (generate each secret with `python -c "import secrets; print(secrets.token_urlsafe(48))"`):

| Variable | Value |
| --- | --- |
| `ENVIRONMENT` | `production` |
| `DATABASE_URL` | Supabase session-pooler URI from step 1 |
| `JWT_ACCESS_SECRET`, `PRELOGIN_SECRET`, `MFA_ENCRYPTION_KEY` | three different random secrets — never reuse dev values |
| `APP_BASE_URL` | `https://vaultessa.vercel.app` |
| `CORS_ORIGINS` | `https://vaultessa.vercel.app` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_STARTTLS=true`, `SMTP_FROM` | Brevo host `smtp-relay.brevo.com`, port `587`, SMTP login/key, verified sender. Required for signup email verification. |
| `FIREBASE_PROJECT_ID` | optional — enables SMS two-step verification |

3. Settings → Networking → **Generate domain**. Copy it (e.g. `https://keyvessa-api.up.railway.app`).

Keep production secrets separate from local secrets. Keep `MFA_ENCRYPTION_KEY` stable
across redeployments so existing encrypted authenticator seeds remain readable.
Do not regenerate secrets on every start. `SMTP_PASSWORD` is a Brevo SMTP key;
`SMTP_FROM` must use a verified sender. The backend host must permit outbound SMTP.
Leave `MAILPIT_BASE_URL` empty in production.

## 3. Vercel (frontend)
1. Edit `frontend/vercel.json`: replace `YOUR-RAILWAY-SERVICE.up.railway.app` with the Railway domain, commit and push.
2. Vercel → **Add New Project** → import the repo → **Root Directory = `frontend`** (framework: Vite).
3. Deploy. Then set `APP_BASE_URL` / `CORS_ORIGINS` on Railway to the final Vercel (or custom) domain.
4. Firebase (when enabled): add the Vercel domain under Authentication → Settings → Authorized domains.

## Production behaviour (automatic when `ENVIRONMENT=production`)
- API docs (`/api/docs`) are hidden, cookies are `Secure`, HSTS is sent.
- Real client IPs are taken from `X-Forwarded-For` (uvicorn `--proxy-headers`) for rate limits and the activity log.
- Rate limiting is in-memory per container: keep **one replica** until Redis-backed limits land.

## Local environment

`backend/.env` is the active private local configuration; `backend/.env.example` is its
tracked template. Local PostgreSQL uses port `5433`, the app uses `http://127.0.0.1:5173`,
and Mailpit receives SMTP on `127.0.0.1:1026`. Open `http://127.0.0.1:8026` to read codes.
Mailpit captures messages locally and does not deliver them to Gmail/Outlook.

To receive real email while running locally, use the production template's Brevo SMTP
settings and your verified sender/credentials in the private local `.env`, while keeping
`ENVIRONMENT=development`, the local database and local app/CORS origins. Restart the backend.
Set `MAILPIT_BASE_URL=` for that configuration; the local Mailpit verification script is
intentionally unavailable when using a remote SMTP server.

After deploying, run migrations and verify `/api/health`, signup code delivery, verification,
and a sign-in/refresh cycle. Deploy frontend and backend together because JSON responses
now use `{ status, message, data }`. The current `frontend/vercel.json` backend hostname is
still a placeholder: replace it with the actual deployed backend domain before deployment.
