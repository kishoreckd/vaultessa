# Quality targets: landing, login, registration

These are proposed service-level objectives (SLOs), not an uptime guarantee or a
contractual service-level agreement (SLA). No production field measurements have
been collected by this audit. Do not display invented uptime or performance scores.

| Indicator | Target | Measurement |
| --- | --- | --- |
| LCP | ≤ 2.5 seconds | 75th percentile, mobile and desktop separately |
| INP | ≤ 200 milliseconds | 75th percentile, mobile and desktop separately |
| CLS | ≤ 0.1 | 75th percentile, mobile and desktop separately |
| Public route availability | Proposed 99.9% over a rolling 30 days | External synthetic GET probes of `/`, `/login`, `/register`; a 200 SPA shell alone does not prove successful rendering |
| Critical UI behavior | No failures in release checks | Navigation, validation, registration, login/MFA, recovery |
| Accessibility | Aim for WCAG 2.2 AA | Automated checks plus keyboard, screen reader, contrast and zoom review |
| Dependencies | No known high/critical production advisories | `npm audit --omit=dev` |

Sources: [Google's Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds),
[WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## Release checks

From `frontend`: `npm run test`, `npm run build`,
`npm run check:performance`, and `npm audit --omit=dev`.
The budget script checks individual artifacts, not the complete transitive route
download. Route modules are lazy-loaded so the public pages do not eagerly load
vault editors, teams, sharing screens and settings.
The initial shared entry was about 231 KiB gzip before this audit and about
176 KiB after route splitting. Its 190 KiB ceiling leaves limited regression
headroom; smaller remains preferable. These sizes exclude separately loaded
shared dependencies and do not prove any Core Web Vitals threshold.

Marketing artwork is served as responsive WebP at 640, 960 and 1536 pixels.
The source PNGs remain as editable originals but are not imported by the app.
The homepage hero is approximately 26/45/84 KiB at those sizes, compared with
1688 KiB for its original PNG. The maximum shipped artwork budget is now 120 KiB.
App-only toast/dialog UI and authentication bootstrap code load in separate chunks.
Public routes allow indexing; private routes use noindex metadata and production
X-Robots-Tag headers. No production Lighthouse score is claimed by these changes.

## Authentication and privacy

- Login/registration have explicit labels, autocomplete hints, validation focus,
  pending-state buttons and submission guards. The shared auth card provides an
  h1 and page-specific browser title. Authentication failures remain visible.
- Do not lower password KDF work factors to meet a page-speed target. Measure
  authentication API latency and browser key derivation separately.
- Do not automatically retry registration or login POSTs: retries can cause
  duplicate side effects or distort rate limits.
- Analytics stays optional and uses explicit public-marketing-only consent; see `src/analytics/README.md`. Never send form values, emails,
  passwords, share identifiers, recovery material or full URLs to monitoring.
  GA4 is not an availability monitor.
- Backend `/api/health` reports database readiness; email configuration
  indicators do not establish successful delivery or verification.

## Outstanding verification

Browser automation was unavailable during implementation. No Lighthouse score,
field Core Web Vitals, production uptime, real-device layout, or WCAG compliance
is claimed. Run mobile/desktop Lighthouse on a production-like deployment; perform
keyboard/zoom/screen-reader checks and authenticated end-to-end flows using test
accounts. Set up external availability probes and privacy-reviewed metrics before
advertising an SLA. Credentials/project IDs remain required to activate services.
