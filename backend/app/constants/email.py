"""One Vaultessa palette and an explicit illustration mapping for every email context."""

from pathlib import Path

ASSET_DIR = Path(__file__).resolve().parents[1] / "static" / "email"
THEME = {
    "brand": "Vaultessa",
    "primary": "#4F46E5",
    "ink": "#201B43",
    "muted": "#716B8B",
    "background": "#F5F3FB",
    "lavender": "#F7F6FF",
    "border": "#E9E5F4",
}
ILLUSTRATIONS = {
    "message": "welcome",
    "welcome": "welcome",
    "verify_email": "verification",
    "forgot_password": "recovery",
    "recovery_completed": "recovery",
    "recovery_enabled": "recovery",
    "recovery_disabled": "locked",
    "share_invitation": "sharing",
    "share_received": "sharing",
    "access_changed": "sharing",
    "link_opened": "sharing",
    "link_locked": "locked",
    "new_device": "security",
    "account_locked": "locked",
    "mfa_changed": "security",
    "password_changed": "security",
    "token_created": "developer",
    "expiry_reminder": "expiry",
}
EMAIL_ASSETS = {"vaultessa-logo": ASSET_DIR / "email-mark.png"}
EMAIL_ASSETS.update(
    {f"vaultessa-{name}": ASSET_DIR / f"illustration-{name}.png" for name in set(ILLUSTRATIONS.values())}
)
