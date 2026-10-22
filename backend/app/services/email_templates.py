"""One consistent layout for every email (plain-text + HTML). Never put secrets in emails."""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from app.constants.email import EMAIL_ASSETS, ILLUSTRATIONS, THEME
from app.core.config import get_settings
from app.db.models.external_share_model import ExternalShare


@dataclass
class EmailContent:
    subject: str
    heading: str
    paragraphs: list[str]
    button: tuple[str, str] | None = None  # (label, url)
    details: list[tuple[str, str]] = field(default_factory=list)  # label/value rows
    footnote: str = "You're receiving this because of activity on your Vaultessa account."
    tone: str = "info"  # "info" | "alert"
    mark: str = "lock"  # "lock" (account email) | "unlock" (guest share invitation)
    template: str = "message.html"
    preheader: str = ""  # Short inbox preview; never include secret values.


_ENV = Environment(
    loader=FileSystemLoader(Path(__file__).resolve().parents[1] / "utils/templates/emails"),
    autoescape=select_autoescape(["html"]),
    undefined=StrictUndefined,
)


def render(content: EmailContent, *, preview: bool = False) -> tuple[str, str, str]:
    """HTML is maintained in utils/templates/emails; plain text remains an email fallback."""
    lines = [content.heading, "", *content.paragraphs]
    if content.details:
        lines += ["", *(f"{k}: {v}" for k, v in content.details)]
    if content.button:
        lines += ["", f"{content.button[0]}: {content.button[1]}"]
    lines += ["", content.footnote]
    name = Path(content.template).stem
    # New mail types must deliberately choose purpose-specific Vaultessa artwork.
    art = ILLUSTRATIONS[name]

    def asset(cid: str) -> str:
        return "../static/email/" + EMAIL_ASSETS[cid].name if preview else "cid:" + cid

    html = _ENV.get_template(content.template).render(
        content=content,
        theme=THEME,
        logo=asset("vaultessa-logo"),
        illustration=asset("vaultessa-" + art),
        illustration_alt=f"Vaultessa {name.replace('_', ' ')} illustration",
        year=datetime.now(UTC).year,
        verification_ttl_hours=get_settings().verification_ttl_hours,
    )
    return content.subject, "\n".join(lines), html


def verification_email(name: str, link: str) -> EmailContent:
    return EmailContent(
        template="verify_email.html",
        subject="Verify your Vaultessa email",
        heading="Verify your email address",
        preheader="Confirm your email to finish setting up Vaultessa.",
        paragraphs=[
            f"Hi {name}, confirm this email address for your Vaultessa account.",
            f"This link expires in {get_settings().verification_ttl_hours} hours and works once. If you didn't create an account, ignore this email.",
        ],
        button=("Verify email", link),
        footnote="Vaultessa will never ask you to send your master password or recovery key by email.",
    )


def welcome_email(name: str, app_url: str) -> EmailContent:
    return EmailContent(
        template="welcome.html",
        subject="Welcome to Vaultessa",
        heading="Your email is verified",
        preheader="Your vault is ready. Set up a recovery key to protect against a forgotten master password.",
        paragraphs=[
            f"Welcome, {name}. You can now enable vault recovery in Settings.",
            "Save your recovery key somewhere safe outside Vaultessa. It is different from your two-step verification recovery codes.",
        ],
        button=("Open your vault", app_url),
    )


def forgot_password_email(name: str, link: str) -> EmailContent:
    return EmailContent(
        template="forgot_password.html",
        subject="Recover your Vaultessa account",
        heading="Set a new master password",
        preheader=f"Use this link and your saved recovery key within {get_settings().password_reset_ttl_minutes} minutes.",
        paragraphs=[
            f"Hi {name}, someone requested recovery for your Vaultessa account.",
            "Open the link and enter the recovery key you saved earlier. This link alone cannot unlock your vault.",
            f"The link expires in {get_settings().password_reset_ttl_minutes} minutes and works once. If you didn't request this, ignore the email; your password has not changed.",
        ],
        button=("Recover my vault", link),
        mark="unlock",
        footnote="Never email your master password or recovery key. Enter your key only on your Vaultessa website.",
    )


def recovery_completed_email(name: str, app_url: str) -> EmailContent:
    return EmailContent(
        template="recovery_completed.html",
        subject="Your Vaultessa account was recovered",
        heading="Master password reset completed",
        paragraphs=[
            f"Hi {name}, your saved recovery key was used to set a new master password.",
            "All sessions were signed out and developer access tokens were revoked. Two-step verification remains enabled if you set it up.",
            "Your recovery key was consumed. After signing in, create a new one in Settings.",
            "If you didn't do this, secure your email account and contact your administrator or support.",
        ],
        button=("Sign in", app_url + "/login"),
        tone="alert",
    )


def recovery_key_email(enabled: bool, app_url: str) -> EmailContent:
    return EmailContent(
        template="recovery_enabled.html" if enabled else "recovery_disabled.html",
        subject=f"Vaultessa vault recovery {'enabled' if enabled else 'disabled'}",
        heading=f"Vault recovery {'enabled' if enabled else 'disabled'}",
        paragraphs=[
            "Your vault recovery settings were changed.",
            "Recovery needs both an email link and your saved recovery key. Changing the key invalidates the previous key.",
            "If you didn't make this change, review your account security.",
        ],
        button=("Review settings", app_url + "/settings"),
        tone="alert",
    )


def expiry_reminder(expires_at: datetime, stage: str, item_url: str) -> EmailContent:
    expired = stage == "expired"
    return EmailContent(
        template="expiry_reminder.html",
        subject="A vault item has expired" if expired else "A vault item is expiring soon",
        heading="Time to update this item" if expired else "A little heads-up from your vault",
        preheader="Review the expiry date of an item you own.",
        paragraphs=[
            "An item in your vault has reached its expiry date."
            if expired
            else "An item in your vault is approaching the expiry date you set.",
            "Open Vaultessa to identify the item and update it. Its name and password remain encrypted and are never included in this email.",
        ],
        details=[
            ("Expires", expires_at.strftime("%d %b %Y, %H:%M UTC")),
            (
                "Reminder",
                {"7_days": "Within seven days", "1_day": "Within one day", "expired": "Expired"}[stage],
            ),
        ],
        button=("Review item", item_url),
    )


def _expiry_phrase(expires_at: datetime) -> str:
    hours = round((expires_at - datetime.now(UTC)).total_seconds() / 3600)
    if hours < 1:
        return "in less than an hour"
    if hours < 48:
        return f"in {hours} hour{'s' if hours != 1 else ''}"
    return f"in {round(hours / 24)} days"


def share_invitation(share: ExternalShare, link: str) -> tuple[str, str, str]:
    """Returns (subject, text, html)."""
    sender = share.owner.name
    expires = f"{share.expires_at.strftime('%d %b %Y, %H:%M UTC')} ({_expiry_phrase(share.expires_at)})"
    if share.max_views == 1:
        access = "One-time view — deleted right after it's opened"
    elif share.max_views:
        access = f"Up to {share.max_views} views until it expires"
    else:
        access = "Can be opened until it expires"
    details = [("Shared by", sender), ("Access", access), ("Expires", expires)]
    if share.code_hash:
        details.append(("Access code", f"Required — {sender} will send it to you separately, not by email"))

    return render(
        EmailContent(
            template="share_invitation.html",
            subject=f"{sender} shared a secure item with you",
            heading="An item has been shared with you",
            preheader="Open your secure invitation. No Vaultessa account needed.",
            paragraphs=["Open it securely in your browser. You don't need a Vaultessa account."],
            button=("Open secure link", link),
            details=details,
            footnote="End-to-end encrypted — Vaultessa can't read what's inside. If you weren't expecting this, ignore this email.",
            mark="unlock",
        )
    )


def render_preview_gallery(links: str) -> str:
    """Only the local generator supplies escaped, constant gallery navigation."""
    return _ENV.get_template("preview_gallery.html").render(links=links)
