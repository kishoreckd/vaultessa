# 09 — Competitor analysis: Passbolt (vs Vaultessa)

Source: passbolt.com homepage, /pricing plan table, /security, /roadmap (reviewed 2026-10-21).
Excluded on request: Microsoft Teams & Slack integrations.
Status: ✅ done in Vaultessa · 🟡 partial · ❌ not yet.

## Community features (free tier)
| Passbolt feature | Vaultessa | Notes / plan |
| --- | :-: | --- |
| Password management | ✅ | |
| TOTP management + TOTP autofill | ❌ | Next: store TOTP seed on items, live codes |
| Encrypted notes | ✅ | Secure note type |
| Custom fields / key-value | 🟡 | Typed templates exist; user-defined fields missing |
| Granular sharing | ✅ | Login only / View / Edit / Manage |
| Users & groups management | ❌ | Teams batch |
| Multi-factor authentication | 🟡 | DB + TOTP core built; endpoints & UI next |
| Private & shared folders | 🟡 | Private ✅, shared folders ❌ |
| Mobile apps (iOS, Android) | ❌ | Phase 3 |
| Search, filters, favourites | ✅ | + keyboard shortcuts |
| Email notifications | 🟡 | Share-link emails only |
| Import / export (KDBX, CSV) | ❌ | Next |
| Browser extension (quick access) | ❌ | Phase 3 |
| Autofill / in-form suggest | ❌ | Needs extension |
| Multiple themes | ✅ | Light / dark / system |
| Role-based access control | ❌ | Teams batch |
| Self-registration (domain allow-list) | 🟡 | Open sign-up; no domain restriction |
| Desktop app (Windows) | ❌ | Phase 3 |
| Password expiry (per item) | ❌ | We flag “old” passwords only |
| Admin health check | 🟡 | Basic `/api/health` |
| Secret history | ✅ | |
| Offline mode | ❌ | Phase 3 |
| Multiple URIs per item, site icons | ❌ | |
| Suspended users | ❌ | Teams batch |
| Encrypted metadata (names, URLs) | ✅ | Everything is encrypted already |

## Pro features (paid tier)
| Passbolt feature | Vaultessa | Notes / plan |
| --- | :-: | --- |
| LDAP / AD user & group provisioning | ❌ | Enterprise batch |
| SCIM | ❌ | Enterprise batch |
| SSO: Microsoft, Google, OpenID, AD FS | ❌ | Enterprise batch |
| Account recovery (admin-approved escrow) | ❌ | Org recovery key |
| MFA policies | ❌ | Teams batch |
| Activity log (org-wide audit) | 🟡 | Personal log ✅, org-wide ❌ |
| Logs as syslog / files (SIEM) | ❌ | |
| Tags | ❌ | |
| User passphrase policies | ❌ | Teams batch |
| Password (generator) policies | ❌ | Teams batch |
| Password expiry policy | ❌ | Teams batch |

## Platform & security
| Passbolt capability | Vaultessa | Notes / plan |
| --- | :-: | --- |
| End-to-end encryption, per-item keys | ✅ | AES-256-GCM per item, RSA-OAEP sharing |
| Brute-force protection | ✅ | PBKDF2 600k + rate limits (+ lockout in progress) |
| Phishing protection: personal security token + URL matching | ❌ | Add with browser extension |
| Public JSON API + docs | ✅ | OpenAPI at `/api/docs` |
| CLI & SDKs, API tokens, secret retrieval for CI/CD | ❌ | |
| Just-in-time / privileged access | ❌ | Access requests |
| Deployment: Docker, Helm, Linux packages, air-gapped | 🟡 | Backend Dockerfile; full stack images next |
| Third-party audits, SOC 2, bug bounty | — | Organisational, pre-launch |

## On Passbolt’s roadmap (not shipped) — Vaultessa status
Passkeys (MFA & login) ❌ · new types: SSH key ✅, credit cards ✅, files ❌, certificates ❌ · admin reports ❌ ·
**advanced share options ✅ (we already have one-time / time-limited links with access codes)**.

## Where Vaultessa is already ahead
- Share links for people **without an account**: one-time or time-limited, access code, re-open, outside-domain flag.
- Password health dashboard (weak / reused / old) with one-click fix.
- Typed item templates (card, bank, SSH key, API key, server, Wi-Fi, identity).
- Keyboard-first vault, readable activity timeline.
