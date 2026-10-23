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
1. In the frontend hosting environment, set `BACKEND_URL=https://vaultessa-backend.vercel.app`
   (or your actual backend origin) and `VITE_API_BASE_PATH=/api`. `frontend/vercel.ts`
   reads `BACKEND_URL` to configure the proxy. No backend hostname is stored in JSON.
2. Vercel → **Add New Project** → import the repo → **Root Directory = `frontend`** (framework: Vite).
3. Deploy. Then set `APP_BASE_URL` / `CORS_ORIGINS` on Railway to the final Vercel (or custom) domain.
4. Firebase (when enabled): add the Vercel domain under Authentication → Settings → Authorized domains.

## Production behaviour (automatic when `ENVIRONMENT=production`)
- API docs are disabled by default. With `ENABLE_API_DOCS=true`, both `/api/docs`
  and `/api/openapi.json` require the dedicated Swagger username/password. Cookies are `Secure`, HSTS is sent.
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
now use `{ status, message, data }`. The frontend deployment requires `BACKEND_URL` to be a public HTTPS origin with no `/api`
path. Change it in hosting variables and redeploy; the `/api` suffix is added automatically.

## Password-protected Swagger in production

Keep `ENVIRONMENT=production` and set these **backend-only** hosting variables:

```dotenv
ENABLE_API_DOCS=true
SWAGGER_USERNAME=vaultessa_admin
SWAGGER_PASSWORD=<a-long-random-password>
```

A generated password is stored in the private `backend/.env.production`; copy it to
backend hosting variables without committing it. The public examples leave it blank.
Startup rejects enabled docs with missing credentials, a colon in the username, or a
password shorter than 16 ASCII characters. Generate a random password of 24+ characters.
Restart/redeploy after changing settings. The browser challenges for credentials at
`https://vaultessa-backend.vercel.app/api/docs`; its schema URL is protected too.
Serve this over HTTPS. Swagger credentials do not authorize vault API calls; use
Swagger's Authorize button with the normal app bearer token for those endpoints.
Protected docs use the existing per-IP authentication rate limit, which remains
per-process and does not provide a shared limit across serverless instances.
Setting `ENABLE_API_DOCS=false` disables production documentation. Development/test
retain the existing public docs unless protection is explicitly enabled.

## Frontend URL settings in environment variables

The frontend uses Vercel programmatic configuration (`frontend/vercel.ts`) instead
of a static `vercel.json`. Set `BACKEND_URL` in the frontend deployment environment.
The value is server/build-only, with no `VITE_` prefix. Browser requests remain
relative to `/api`, and the deployment rewrite forwards them to `BACKEND_URL/api`.
The Vite dev proxy also reads `BACKEND_URL` from `.env.local`; local uses HTTP on
127.0.0.1 while the deployment configuration requires a public HTTPS origin.
Use `frontend/.env.production.example` as the import reference. Changing hosting
variables takes effect after redeployment. Swagger credentials remain backend-only.
