# Vaultessa landing page

All page-specific components, styles, illustration assets, and integration logic live here.
The existing App router displays this page at `/` for logged-out visitors. Signed-in
users keep the existing vault-at-`/` behavior. `/login`, `/register`, recovery, and
authenticated routes retain their existing functionality. Public explanation pages
are available at `/features`, `/security`, and `/how-it-works`, each with its own
illustration, detailed sections, browser title, and analytics page identity. The
authenticated security dashboard now lives at `/vault/security`; its app navigation
and onboarding links have been updated to avoid a collision with public `/security`.

## Integrations

Public configuration keys are listed in `frontend/.env.example` and
`frontend/.env.production.example`. Fill them in `.env.local` for development and
the frontend Vercel project's environment settings for production, then rebuild.
No actual IDs or project credentials have been invented or supplied.

- `VITE_GA_MEASUREMENT_ID`: GA4 web stream ID (`G-...`). App-wide consent-based
  analytics is centralized in `src/analytics`, covering sanitized page views,
  control clicks and form submissions. See [the event contract](../analytics/README.md)
  for privacy rules and required GA4 console settings. Disable Enhanced Measurement
  to prevent duplicate or automatic sensitive collection. Prior public-only consent
  is not reused for this expanded scope.
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
  `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`,
  `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`:
  copy the public web app configuration from Firebase Project settings.
  This initializes a named Firebase App only. Firebase Analytics is deliberately
  not initialized alongside GA4, avoiding duplicate tracking. SMS enrollment and
  Firebase sign-in flows are not added by this landing-page change; vault
  authentication continues through the existing backend. Server Firebase project
  configuration remains separate.

The page is a close implementation of the approved concept, with additional
Security, How it works, and FAQ sections. Preview entries are fictional. Recovery
copy reflects saved recovery keys rather than the concept's unsupported trusted
device recovery claim.

## Illustration provenance

`assets/vaultessa-hero.png` was generated with the built-in imagegen tool from the
approved indigo mockup. Final prompt: extract and recreate only the upper-right
hero illustration, three diverse adults using a laptop and smartphone around a
pale indigo vault, masked login cards, teal leaves, cream clothing, indigo shirt,
soft near-white background, no website text or navigation, 3:2 landscape.

Three additional illustrations were generated with the built-in imagegen tool and
saved in `assets/features.png`, `assets/security.png`, and `assets/how-it-works.png`.
Their final prompt set uses the following shared art direction: standalone editorial
illustration for Vaultessa, premium softly painted realistic people, natural varied
skin tones, cream clothing, indigo shirts, teal botanical leaves, pale indigo organic
background shapes, warm white #F8FAFC background blending at edges, spacious 3:2
landscape, no text, headings, screenshot, or watermark. Individual scenes:

- Features: a woman organising login cards, folders and notes beside a laptop,
  another man sharing one protected card, and a small indigo safe.
- Security: a woman holding a key beside a laptop inside a translucent shield,
  and a man beside an encrypted cloud and locked vault, showing device/storage separation.
- How it works: three adults creating an account, organising passwords beside a
  vault, and placing a recovery key card into an envelope.

In GA4, compare `page_view` by sanitized page location and `ui_click` by action
and control type. `signup_cta_click` includes a fixed CTA placement. This covers
app routes as well as marketing pages after fresh app-wide consent; share IDs,
query strings and fragments are excluded. The central event contract is the source
of truth for current tracking behavior.
