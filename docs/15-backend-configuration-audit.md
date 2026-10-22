# Backend configuration audit

Application settings belong in `app/core/config.py` on `Settings`, with environment names documented in `backend/.env.example`. The ignored local `backend/.env` has the missing policy keys added without replacing existing values. Services read settings when used; the settings object is cached until process restart.

## Centralised policy

- Scrypt N, r, p, output length and memory ceiling; JWT algorithm; MFA challenge lifetime.
- Failed-login threshold and lock duration; verification/reset TTL, resend cooldown and reset attempt limit.
- Share lifetime and code attempts; API token lifetime; refresh cookie name.
- Global, authentication, refresh, lookup, guest-share and machine API rate limits and window.
- Authenticator period/digits/issuer and recovery-code count.
- SMTP endpoint, sender, credentials, transport settings and timeout; expiry polling interval and batch size.
- Database URL, app origin, CORS origins and Firebase verification settings.

All six values previously declared in `core/security.py` now come from Settings and are listed in the environment example. Defaults preserve the existing behavior.

## Compatibility

Scrypt hashes store N, r, p and digest length. Verification uses those stored values, while new hashes use the current settings. Keep the configured memory ceiling large enough for previously stored hashes as well as new ones. No password hashes or encrypted vault data are rewritten by this refactor.

JWT_ALGORITHM is validated as HS256; unsupported algorithms, including `none`, are rejected. TOTP_PERIOD_SECONDS=30 and TOTP_DIGITS=6 remain validated format choices because existing authenticator records do not store individual format parameters. Changing those formats requires a compatibility migration.

Email verification/recovery wording and enforcement now use the same configured lifetimes. Regenerate HTML previews after configuration changes; generated files contain resolved values.

## Deliberate constants

Stable wire-format identifiers and HTTP paths live in `constants/security.py` and `constants/http.py`. Access enums and permission ordering live in `constants/vault.py`; illustration mappings and palette live in `constants/email.py`. Pydantic field lengths, database column sizes, cryptographic byte layouts, HTTP status codes and display text remain code contracts. Moving those into environment variables would allow incompatible contracts between clients, persisted records and the API.

## Source inventory

The audit scanned all application Python sources and canonical HTML templates, including module-level assignments, endpoints, settings access, numeric policy limits and URL literals. Generated previews and PNG binaries are output/assets, not independent configuration sources.

| Python source | Responsibility | Classes | Functions |
| --- | --- | ---: | ---: |
| `api/__init__.py` | HTTP routes, audit and commits | 0 | 0 |
| `api/account.py` | HTTP routes, audit and commits | 0 | 12 |
| `api/audit.py` | HTTP routes, audit and commits | 2 | 1 |
| `api/auth.py` | HTTP routes, audit and commits | 0 | 10 |
| `api/external_shares.py` | HTTP routes, audit and commits | 2 | 10 |
| `api/folders.py` | HTTP routes, audit and commits | 0 | 4 |
| `api/health.py` | HTTP routes, audit and commits | 0 | 1 |
| `api/organizations.py` | HTTP routes, audit and commits | 0 | 20 |
| `api/recovery.py` | HTTP routes, audit and commits | 0 | 8 |
| `api/secrets.py` | HTTP routes, audit and commits | 0 | 6 |
| `api/sharing.py` | HTTP routes, audit and commits | 0 | 6 |
| `api/tokens.py` | HTTP routes, audit and commits | 0 | 6 |
| `constants/__init__.py` | Stable protocol and presentation constants | 0 | 0 |
| `constants/email.py` | Stable protocol and presentation constants | 0 | 0 |
| `constants/http.py` | Stable protocol and presentation constants | 0 | 0 |
| `constants/organization.py` | Stable protocol and presentation constants | 1 | 0 |
| `constants/security.py` | Stable protocol and presentation constants | 0 | 0 |
| `constants/vault.py` | Stable protocol and presentation constants | 4 | 0 |
| `core/__init__.py` | Application infrastructure and settings | 0 | 0 |
| `core/application.py` | Application infrastructure and settings | 0 | 3 |
| `core/config.py` | Application infrastructure and settings | 1 | 6 |
| `core/deps.py` | Application infrastructure and settings | 1 | 1 |
| `core/errors.py` | Application infrastructure and settings | 1 | 16 |
| `core/firebase.py` | Application infrastructure and settings | 0 | 3 |
| `core/rate_limit.py` | Application infrastructure and settings | 1 | 2 |
| `core/schema.py` | Application infrastructure and settings | 2 | 2 |
| `core/security.py` | Application infrastructure and settings | 0 | 15 |
| `core/totp.py` | Application infrastructure and settings | 0 | 7 |
| `db/__init__.py` | Database models and sessions | 0 | 0 |
| `db/model_helpers.py` | Database models and sessions | 0 | 3 |
| `db/models/__init__.py` | Database models and sessions | 0 | 0 |
| `db/models/api_token_grant_model.py` | Database models and sessions | 1 | 0 |
| `db/models/api_token_model.py` | Database models and sessions | 1 | 0 |
| `db/models/audit_log_model.py` | Database models and sessions | 1 | 0 |
| `db/models/expiry_notification_model.py` | Database models and sessions | 1 | 0 |
| `db/models/external_share_model.py` | Database models and sessions | 1 | 0 |
| `db/models/folder_model.py` | Database models and sessions | 1 | 0 |
| `db/models/organization_domain_model.py` | Database models and sessions | 1 | 0 |
| `db/models/organization_invitation_model.py` | Database models and sessions | 1 | 0 |
| `db/models/organization_member_model.py` | Database models and sessions | 1 | 0 |
| `db/models/organization_model.py` | Database models and sessions | 1 | 0 |
| `db/models/secret_access_model.py` | Database models and sessions | 1 | 0 |
| `db/models/secret_history_model.py` | Database models and sessions | 1 | 0 |
| `db/models/secret_model.py` | Database models and sessions | 1 | 0 |
| `db/models/session_model.py` | Database models and sessions | 1 | 0 |
| `db/models/user_model.py` | Database models and sessions | 1 | 1 |
| `db/session.py` | Database models and sessions | 1 | 1 |
| `main.py` | ASGI entry point | 0 | 0 |
| `schemas/__init__.py` | Request/response validation contracts | 0 | 0 |
| `schemas/account.py` | Request/response validation contracts | 11 | 0 |
| `schemas/auth.py` | Request/response validation contracts | 9 | 0 |
| `schemas/external_shares.py` | Request/response validation contracts | 7 | 0 |
| `schemas/folders.py` | Request/response validation contracts | 2 | 0 |
| `schemas/organizations.py` | Request/response validation contracts | 11 | 1 |
| `schemas/recovery.py` | Request/response validation contracts | 6 | 0 |
| `schemas/secrets.py` | Request/response validation contracts | 6 | 0 |
| `schemas/sharing.py` | Request/response validation contracts | 5 | 0 |
| `schemas/tokens.py` | Request/response validation contracts | 5 | 0 |
| `services/__init__.py` | Business rules, authorization and delivery | 0 | 0 |
| `services/account_service.py` | Business rules, authorization and delivery | 0 | 12 |
| `services/audit_service.py` | Business rules, authorization and delivery | 1 | 4 |
| `services/auth_service.py` | Business rules, authorization and delivery | 0 | 14 |
| `services/email_config.py` | Business rules, authorization and delivery | 1 | 2 |
| `services/email_jobs.py` | Business rules, authorization and delivery | 0 | 2 |
| `services/email_service.py` | Business rules, authorization and delivery | 1 | 1 |
| `services/email_templates.py` | Business rules, authorization and delivery | 1 | 14 |
| `services/external_shares_service.py` | Business rules, authorization and delivery | 0 | 14 |
| `services/folders_service.py` | Business rules, authorization and delivery | 0 | 5 |
| `services/notifications_service.py` | Business rules, authorization and delivery | 1 | 19 |
| `services/organizations_service.py` | Business rules, authorization and delivery | 0 | 20 |
| `services/recovery_service.py` | Business rules, authorization and delivery | 0 | 8 |
| `services/secrets_service.py` | Business rules, authorization and delivery | 0 | 10 |
| `services/sharing_service.py` | Business rules, authorization and delivery | 0 | 6 |
| `services/tokens_service.py` | Business rules, authorization and delivery | 0 | 10 |
| `utils/__init__.py` | Package registration | 0 | 0 |

Python sources scanned: 75. Canonical HTML templates: 22.

Organisation policy and optional local Mailpit settings were subsequently added to Settings and grouped environment examples. See [teams](17-organisations-and-teams.md).
