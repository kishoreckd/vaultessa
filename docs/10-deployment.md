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
1. New project → **Deploy from GitHub repo** → choose the repo → set **Root Directory = `backend`**.
   `backend/railway.json` makes Railway build the Dockerfile, run `alembic upgrade head` before each deploy, and health-check `/api/health`.
2. **Variables** (generate each secret with `python -c "import secrets; print(secrets.token_urlsafe(48))"`):

| Variable | Value |
| --- | --- |
| `ENVIRONMENT` | `production` |
| `DATABASE_URL` | Supabase session-pooler URI from step 1 |
| `JWT_ACCESS_SECRET`, `PRELOGIN_SECRET`, `MFA_ENCRYPTION_KEY` | three different random secrets — never reuse dev values |
| `APP_BASE_URL` | `https://<your-vercel-domain>` |
| `CORS_ORIGINS` | `https://<your-vercel-domain>` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_STARTTLS=true`, `SMTP_FROM` | your email provider (optional — email features stay off without it) |
| `FIREBASE_PROJECT_ID` | optional — enables SMS two-step verification |

3. Settings → Networking → **Generate domain**. Copy it (e.g. `https://keyvessa-api.up.railway.app`).

## 3. Vercel (frontend)
1. Edit `frontend/vercel.json`: replace `YOUR-RAILWAY-SERVICE.up.railway.app` with the Railway domain, commit and push.
2. Vercel → **Add New Project** → import the repo → **Root Directory = `frontend`** (framework: Vite).
3. Deploy. Then set `APP_BASE_URL` / `CORS_ORIGINS` on Railway to the final Vercel (or custom) domain.
4. Firebase (when enabled): add the Vercel domain under Authentication → Settings → Authorized domains.

## Production behaviour (automatic when `ENVIRONMENT=production`)
- API docs (`/api/docs`) are hidden, cookies are `Secure`, HSTS is sent.
- Real client IPs are taken from `X-Forwarded-For` (uvicorn `--proxy-headers`) for rate limits and the activity log.
- Rate limiting is in-memory per container: keep **one replica** until Redis-backed limits land.
