# Email destinations and dynamic data

## User experience

Priya should understand what happened and the next action; Arjun should reach the affected item or page with few clicks; Lakshmi needs readable text, descriptive links and keyboard access. The mail retains the Vaultessa palette and contextual PNG artwork, with a smaller illustration, a compact heading, a dynamic greeting for account notifications, one primary action and a plain-text fallback.

## Destination mapping

| Email | Destination | Frontend handling |
| --- | --- | --- |
| Verify email | `/verify-email#token=...` | Public verification page consumes token |
| Welcome | `/vault/settings#account-security` | Security/recovery section |
| Forgot master password | `/recover#token=...` | Public recovery page; saved recovery key still required |
| Recovery completed | `/login` | Sign in |
| Recovery enabled/disabled | `/vault/settings#account-security` | Security/recovery section |
| Password changed, new device, MFA changed | `/vault/settings#account-security` | Security, sessions and MFA controls |
| Account locked | `/login` | Sign in after lockout expires |
| Token created | `/vault/developer` | Token management |
| Item shared, access changed/removed | `/vault?view=shared` | Shared-with-me filter; removed items are not shown |
| Link opened/locked | `/vault/links?link=<id>` | Opens the affected link details, including inactive links |
| Team invitation/membership | `/vault/teams?invitation=<id>` or `/vault/teams` | Verified-email acceptance and member management |
| Guest invitation | `/s/<id>#<client-created-key>` | Public guest page, optional access code |
| Item nearing expiry/expired | `/vault?item=<id>` | Open that item after unlocking; handles missing/deleted items |

APP_BASE_URL supplies the origin for account mail. Guest invitation URLs are validated against configured origins before sending. Login, MFA completion and unlocking resume protected email destinations using router state. Only known internal paths are accepted; external destinations and auth redirect loops are rejected. No vault keys or plaintext item data are persisted for navigation.

## Dynamic values

Names come from account records, actors from the share/change event, permissions from the access grant, recipient addresses from the saved share, and expiry from the item/link. Jinja autoescapes rendered text. `guest@example.com`, Priya, and Arjun belong to the preview generator only. Every generated sample has a preview-only banner; those banners are not sent.

A guest link does not authenticate the visitor's identity. Link alerts therefore say **intended recipient**, rather than claiming that the saved recipient opened or attempted the link. Missing recipient addresses are omitted. Item names/passwords remain encrypted and are not included in mail.

## API audit scope and remaining gap

Frontend API calls are split by feature under `frontend/src/api/<feature>/api.ts`, with request/response contracts in adjacent `types.ts` files. Shared transport, response decoding and token refresh live in `frontend/src/api/client.ts`. Machine-secret retrieval belongs to the SDK/CLI, and health/OpenAPI endpoints serve operations/developer tools.

Firebase SMS enablement now has a typed frontend API method, and backend SMS verification exists. The frontend still lacks the phone number / Firebase SMS challenge UI for enrolling or signing in with SMS. Authenticator and recovery-code flows are implemented. Organisation/team onboarding is implemented; see [teams](17-organisations-and-teams.md). Email routing correctness does not establish that all planned product features are complete.

## Validation limits

Automated coverage checks dynamic recipient values, HTML escaping, known destinations, redirect validation and backend event flows. Typechecking and a production build validate frontend integration. Real inbox rendering and the complete click-through journey in a browser still require manual verification.
