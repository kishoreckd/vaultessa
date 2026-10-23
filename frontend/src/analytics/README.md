# Marketing-only analytics

Analytics is restricted to the homepage (logged-out visitors), `/features`,
`/security`, and `/how-it-works`. Login, registration, recovery, shared links,
unlock, and all authenticated app routes emit no analytics and display no
analytics preferences. Signed-in vault content at `/` is excluded.

The public pages use consent-based `page_view`, `ui_click`, `form_submit` (demo
forms only), and `signup_cta_click` events. The consent key is
`vaultessa:analytics:marketing:v3`. App-wide consent from the previous version is
not reused. All event dispatches and Google-script loading check the route allowlist.
If Google Analytics has loaded, navigating out of the public pages denies analytics
storage and reloads the destination document so the script does not persist into
authentication or vault usage. Direct private-page loads never load it.

Set the real `VITE_GA_MEASUREMENT_ID` and disable ALL Enhanced Measurement in the
GA4 web stream to prevent automatic history, form, link or search collection.
Manual page views exclude query strings and fragments. Private destinations are
represented only by `private`. Labels must match a fixed allowlist; form values,
DOM IDs, item names, keys, passwords, and emails are never sent by our handlers.

Google's script still processes analytics cookies and technical device information
after consent. No GTM or Firebase SDK is loaded. Successful enquiries emit
`generate_lead` with only `form_type=enquiry`, never names, emails or messages.

Tests verify public-only routing, private-destination exclusion, signed-in root
exclusion, parameter stripping, and arbitrary-label rejection. Live event delivery
still needs a real measurement ID and browser verification.
