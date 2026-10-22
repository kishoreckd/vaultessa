"""Email notifications. Queued as background tasks so requests never wait on SMTP.

The server can't read item names (they're encrypted), so emails refer to "an item" and link back
to the app, where the name is shown after the vault is unlocked.
"""

from datetime import UTC, datetime
from enum import StrEnum

from fastapi import BackgroundTasks

from app.core.config import get_settings
from app.db.models.user_model import User
from app.services import email_templates
from app.services.email_service import email_enabled, send_email
from app.services.email_templates import EmailContent, render


class Category(StrEnum):
    SECURITY = "security"  # always on
    SHARING = "sharing"  # items shared with you / access changes
    LINKS = "links"  # activity on share links you created
    EXPIRY = "expiry"  # upcoming and expired owned items


OPTIONAL_CATEGORIES = (Category.SHARING, Category.LINKS, Category.EXPIRY)


def preferences(user: User) -> dict[str, bool]:
    stored = user.notification_prefs or {}
    return {c.value: bool(stored.get(c.value, True)) for c in OPTIONAL_CATEGORIES}


def _enabled(user: User, category: Category) -> bool:
    return category == Category.SECURITY or preferences(user).get(category.value, True)


def _app_url(path: str) -> str:
    return get_settings().app_base_url.rstrip("/") + path


def _queue(background: BackgroundTasks, user: User, category: Category, content: EmailContent) -> None:
    if not email_enabled() or not _enabled(user, category):
        return
    subject, text, html = render(content)
    background.add_task(send_email, user.email, subject, text, html)


def verify_email(background: BackgroundTasks, user: User, token: str) -> None:
    _queue(
        background,
        user,
        Category.SECURITY,
        email_templates.verification_email(user.name, _app_url("/verify-email#token=" + token)),
    )


def welcome(background: BackgroundTasks, user: User) -> None:
    _queue(background, user, Category.SECURITY, email_templates.welcome_email(user.name, _app_url("/")))


def forgot_password(background: BackgroundTasks, user: User, token: str) -> None:
    _queue(
        background,
        user,
        Category.SECURITY,
        email_templates.forgot_password_email(user.name, _app_url("/recover#token=" + token)),
    )


def recovered(background: BackgroundTasks, user: User) -> None:
    _queue(
        background, user, Category.SECURITY, email_templates.recovery_completed_email(user.name, _app_url(""))
    )


def recovery_key_changed(background: BackgroundTasks, user: User, enabled: bool) -> None:
    _queue(background, user, Category.SECURITY, email_templates.recovery_key_email(enabled, _app_url("")))


def _device(user_agent: str | None) -> str:
    if not user_agent:
        return "Unknown device"
    ua = user_agent
    browser = next((b for b in ("Edg", "Chrome", "Firefox", "Safari") if f"{b}/" in ua), "Browser")
    os_name = next((o for o in ("Windows", "Mac OS X", "Android", "iPhone", "Linux") if o in ua), "")
    browser = "Edge" if browser == "Edg" else browser
    return f"{browser} on {'macOS' if os_name == 'Mac OS X' else os_name}" if os_name else browser


# ── Security (always sent) ─────────────────────────────────────────────────────


def master_password_changed(background: BackgroundTasks, user: User) -> None:
    _queue(
        background,
        user,
        Category.SECURITY,
        EmailContent(
            template="password_changed.html",
            subject="Your Vaultessa master password changed",
            heading="Master password changed",
            paragraphs=[
                "Your master password was changed and other devices were signed out. "
                "Your vault items remain encrypted.",
                "If you didn't make this change, review your account security immediately.",
            ],
            button=("Review account security", _app_url("/settings")),
            tone="alert",
        ),
    )


def new_sign_in(background: BackgroundTasks, user: User, ip: str | None, user_agent: str | None) -> None:
    _queue(
        background,
        user,
        Category.SECURITY,
        EmailContent(
            template="new_device.html",
            subject="New sign-in to your Vaultessa account",
            heading="New sign-in from a new device",
            preheader="Review the device and time of this sign-in to your account.",
            paragraphs=[
                f"Hi {user.name}, your account was just signed in to from a device we haven't seen before.",
                "If this was you, there's nothing to do. If not, sign out other devices "
                "and change your master password.",
            ],
            details=[
                ("Device", _device(user_agent)),
                ("IP address", ip or "unknown"),
                ("Time", datetime.now(UTC).strftime("%d %b %Y, %H:%M UTC")),
            ],
            button=("Review devices", _app_url("/settings")),
            tone="alert",
        ),
    )


def account_locked(background: BackgroundTasks, user: User, minutes: int) -> None:
    _queue(
        background,
        user,
        Category.SECURITY,
        EmailContent(
            template="account_locked.html",
            subject="Your Vaultessa account was temporarily locked",
            heading="Too many failed sign-in attempts",
            paragraphs=[
                f"We locked sign-ins to your account for {minutes} minutes after several wrong attempts.",
                "Your vault stays encrypted. If this wasn't you, consider turning on two-step verification.",
            ],
            button=("Open Vaultessa", _app_url("/login")),
            tone="alert",
        ),
    )


def two_step_changed(background: BackgroundTasks, user: User, method: str, enabled: bool) -> None:
    what = "authenticator app" if method == "totp" else "SMS codes"
    _queue(
        background,
        user,
        Category.SECURITY,
        EmailContent(
            template="mfa_changed.html",
            subject=f"Two-step verification {'turned on' if enabled else 'turned off'}",
            heading=f"Two-step verification ({what}) {'is on' if enabled else 'was turned off'}",
            paragraphs=[
                "Signing in now needs a second step, which keeps your vault safer."
                if enabled
                else "If you didn't do this, change your master password and turn it back on.",
            ],
            button=("Security settings", _app_url("/settings")),
            tone="info" if enabled else "alert",
        ),
    )


def token_created(background: BackgroundTasks, user: User, token_name: str, item_count: int) -> None:
    _queue(
        background,
        user,
        Category.SECURITY,
        EmailContent(
            template="token_created.html",
            subject="A new access token was created",
            heading="New access token for CLI / pipelines",
            paragraphs=[
                f"An access token named “{token_name}” was created with read access to {item_count} item(s)."
            ],
            details=[("Token", token_name)],
            button=("Manage tokens", _app_url("/developer")),
            tone="alert",
        ),
    )


# ── Sharing ────────────────────────────────────────────────────────────────────


def item_shared(background: BackgroundTasks, recipient: User, sharer: User, permission: str) -> None:
    _queue(
        background,
        recipient,
        Category.SHARING,
        EmailContent(
            template="share_received.html",
            subject=f"{sharer.name} shared an item with you",
            heading=f"{sharer.name} shared an item with you",
            paragraphs=[
                f"You now have {permission.replace('_', ' ').lower()} access. Find it under “Shared with me”."
            ],
            details=[("Shared by", f"{sharer.name} ({sharer.email})")],
            button=("Open your vault", _app_url("/")),
        ),
    )


def access_changed(background: BackgroundTasks, recipient: User, actor: User, permission: str | None) -> None:
    if permission is None:
        subject, heading, body = (
            "Your access to a shared item was removed",
            "Access removed",
            f"{actor.name} removed your access to an item.",
        )
    else:
        subject, heading, body = (
            "Your access to a shared item changed",
            "Access changed",
            f"{actor.name} changed your access to {permission.replace('_', ' ').lower()}.",
        )
    _queue(
        background,
        recipient,
        Category.SHARING,
        EmailContent(
            template="access_changed.html",
            subject=subject,
            heading=heading,
            paragraphs=[body],
            button=("Open your vault", _app_url("/")),
        ),
    )


# ── Share links ────────────────────────────────────────────────────────────────


def link_opened(background: BackgroundTasks, owner: User, recipient: str | None, one_time: bool) -> None:
    _queue(
        background,
        owner,
        Category.LINKS,
        EmailContent(
            template="link_opened.html",
            subject="Your share link was opened",
            heading="Your share link was opened",
            paragraphs=[
                f"The link you shared with {recipient or 'someone'} was just opened."
                + (" It was a one-time link, so it's now deleted." if one_time else "")
            ],
            button=("View your links", _app_url("/links")),
        ),
    )


def link_locked(background: BackgroundTasks, owner: User, recipient: str | None) -> None:
    _queue(
        background,
        owner,
        Category.LINKS,
        EmailContent(
            template="link_locked.html",
            subject="A share link was locked",
            heading="Share link locked after wrong access codes",
            paragraphs=[
                f"Someone tried the link you shared with {recipient or 'someone'} "
                "with wrong access codes too many times. "
                "It's now disabled. You can re-open it from your links page."
            ],
            button=("View your links", _app_url("/links")),
            tone="alert",
        ),
    )
