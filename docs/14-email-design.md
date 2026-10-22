# Vaultessa email design

Every email must use artwork grounded in Vaultessa and the action or access event it describes. Use the same indigo and lavender visual family throughout. Generic decorative illustrations are insufficient.

The explicit mapping lives in `backend/app/constants/email.py`. Rendering rejects an unmapped mail type; `tests/test_email_design.py` checks that every content template has a mapping and an existing asset.

| Purpose | Illustration |
| --- | --- |
| Welcome | Open vault and protected credential cards |
| Email verification | Vault, envelope and verification seal |
| Recovery | Vault and separately protected recovery key |
| Sharing and access | Secure vault handoff, envelope and key |
| Security changes and new device | Vault, device and shield |
| Expiry | Vault, calendar and hourglass |
| Developer access | Vault and access key cards |
| Locked or disabled access | Closed vault and alert shield |

HTML templates are maintained in `backend/app/utils/templates/emails`, assets in `backend/app/static/email`, configuration in `services/email_config.py`, and transport in `services/email_service.py`. The built-in image generation tool produced the contextual PNG illustrations. The shared art direction was premium indigo/lavender paper and clay forms, Vaultessa vault symbolism, a pale background, no text, and a purpose-specific object from the table above.

Run `python scripts/preview_emails.py` from the backend to regenerate the local HTML gallery at `app/email_previews/index.html`. Plain text is still included as a multipart email fallback; optional text previews require `--text`. Production images are embedded using content IDs.

## Dark email theme

All email contexts inherit automatic dark styling from `layout.html` and `dark_styles.css`.
The dark palette is centralised in `constants/email.py`. Dark backgrounds, panels, text,
borders and button colours use colour-scheme media rules and Outlook dark-mode attribute
selectors. The PNG illustrations retain their original colours on a light lavender panel.
Inline light styles remain the fallback when a client ignores the dark CSS. Some clients
apply their own colour conversion, so exact rendering still needs Gmail/Outlook/device checks.

The gallery provides Light and Dark links for every email: 21 examples, 42 previews.
Files ending in `.dark.html` force the same dark palette for local inspection. Forced rules
are preview-only; live email follows the recipient client's supported theme handling.
The frontend app's theme preference does not control an external email client's theme.

Expiry reminders use the item's explicit expiry control and notify its owner at seven days, one day and expiration. Scheduling stores only item ID, expiry and notification stage, never the decrypted item name or password. Existing encrypted date fields do not automatically become reminder schedules. The backend must remain running with SMTP configured; owners can disable expiry emails in Settings. The ledger records SMTP acceptance, which does not guarantee inbox delivery. A database failure after SMTP acceptance can result in a retry.
