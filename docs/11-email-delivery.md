# Vaultessa email delivery

The shared template layout lives in `backend/app/utils/templates/emails/`; content builders
live in `backend/app/services/email_templates.py`, configuration in `services/email_config.py`,
and SMTP delivery in `services/email_service.py`. The application root contains only `main.py`; no compatibility email modules remain.
Templates produce HTML plus plain text. Brevo delivers
production mail; Mailpit captures development mail. No credentials belong in Git.

## Preview without sending

From `backend`, run `.venv\Scripts\python.exe scripts/preview_emails.py`.
Open `backend/app/email_previews/index.html`. The 19 samples use fictional
recipients and links and render the actual invitation, new-device, verification, welcome and vault-recovery templates.
Logos and contextual illustrations load from local backend assets. No frontend server is required.
Use `--text` only when separate plain-text preview files are useful; production messages always retain the text fallback.
See [email design](14-email-design.md) for the required purpose-specific illustration mapping.

All 19 previews use `APP_BASE_URL` from `backend/.env`, just like sent notifications.
Generated HTML contains the resolved URL at generation time; it does not read `.env` when opened.
After changing the domain, restart the backend and regenerate previews. A development `.env`
will deliberately produce development links. Production requires an HTTPS, non-local origin.
`DATABASE_URL`, `APP_BASE_URL`, and `CORS_ORIGINS` are required configuration without local fallbacks.
`SMTP_FROM` is required when SMTP is enabled. Settings always reads `backend/.env`, regardless
of the process working directory; injected environment variables take precedence.

## Brevo production setup

1. Create a dedicated Vaultessa SMTP key, separate from other applications.
2. Authenticate the sending domain using the DNS records supplied by Brevo and
   verify the sender. Confirm transactional sending is enabled for the account.
3. Set these backend environment variables in Railway:

```dotenv
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_STARTTLS=true
SMTP_USERNAME=<SMTP login from Brevo>
SMTP_PASSWORD=<dedicated SMTP key>
SMTP_FROM=Vaultessa <no-reply@your-verified-domain.example>
APP_BASE_URL=https://your-vaultessa-domain.example
```

Use the SMTP key, not the account password or an API key. Never put these values
in frontend environment variables. Keep the Mailpit defaults for local work.

Before sending real invitations, disable open tracking and click rewriting in
the provider settings, then verify the delivered URL retains its fragment.
The provider can see the full invitation URL in the email body, including its
fragment key. Share access codes through a separate channel. Emails must never
include vault contents, master passwords, or recovery codes.

## Release checks and remaining work

- Inspect previews at narrow and desktop widths, with images blocked.
- Send explicitly requested test messages and inspect Gmail and Outlook delivery,
  authentication results, plain text, and intact links.
- Account notifications use in-process background tasks and log failures. Guest invitation
  requests report SMTP acceptance or a safe delivery failure directly. Expiry reminders run
  periodically with a database acceptance ledger and retry failed submissions. There is no
  durable retry queue or delivery confirmation. Add an outbox worker and authenticated
  delivery/bounce webhooks before relying on email for critical production flows.
- Review notification buttons when account-security and developer screens ship.

Reference: https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP
