# Analytics event contract

One GA4 integration covers all current app routes. It requires a real
`VITE_GA_MEASUREMENT_ID` and explicit consent using the new
`vaultessa:analytics:v2` preference. Previous public-only consent is not reused.
Consent can be reviewed on every page using Analytics preferences.

| Event              | Trigger                                                                           | Extra parameters                                                   |
| ------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `page_view`        | Initial screen after session bootstrap; SPA navigation; browser back/forward      | Static page title and sanitized route template                     |
| `ui_click`         | Buttons, links, summary/FAQ controls, tabs, menu items, switches, inputs, selects | `control_type`, allowlisted `action`, sanitized link `destination` |
| `form_submit`      | A form submit event                                                               | No fields, values, names, IDs, action URL or success claim         |
| `signup_cta_click` | Signup CTA                                                                        | Allowlisted `placement` plus sanitized screen context              |

Dynamic/unknown controls use action `control`: never send their visible text,
aria-label, DOM ID or data attributes. Clicking a vault item is countable, but
its name and identity are deliberately unavailable to analytics. Text entry,
search terms, passwords, recovery material, emails and clipboard contents are
never collected by our event handlers. Share URLs become `/s/:id`, unknown paths
become `/not-found`; query strings and fragments are removed. Session state
distinguishes homepage `/` from authenticated vault `/vault` without a user ID.
Blank-page clicks are not meaningful UI interactions and are not recorded.

Page views are deduplicated across React StrictMode effect replays, while returning to a screen after another screen records a new visit. Hash-only navigation is a chapter
click, not a new screen. A signup click can produce both `ui_click` and
`signup_cta_click`; count the named CTA event for that funnel, not their sum.
Form submission is an attempt, not a successful login or registration conversion.
Pointer and keyboard activation of native buttons/links produce click events.
Select/checkbox value changes and text input are not logged.

## GA4 console setup (required)

Disable **all Enhanced Measurement** in this web stream, including history,
outbound links, search, forms and downloads. The implementation sets
`send_page_view: false`; history-based Enhanced Measurement is independently
configured in GA4 and must also be off. This avoids duplicate events and automatic
collection of raw URLs or DOM-derived values. Register event-scoped custom
dimensions `control_type`, `action`, `destination`, and `placement` to use them
in reports. Inspect sanitized payloads in development with a dedicated test
property before production rollout. No real IDs are supplied by the code change.

Google's SDK still processes technical information and analytics cookies after
consent. It is a third-party script with page access; this event contract is not
a claim of sandbox isolation. Ad storage/personalization/signals are disabled.
Declining loads no Google script; revoking active consent denies storage and
reloads the document. Blocking localStorage keeps the choice in memory.

GTM is not installed. Firebase app initialization remains separate and Firebase
Analytics is not additionally started, avoiding duplicate GA4 collection.

References: [Manual GA4 page views](https://developers.google.com/analytics/devguides/collection/ga4/views),
[Google's PII guidance](https://support.google.com/analytics/answer/6366371).
