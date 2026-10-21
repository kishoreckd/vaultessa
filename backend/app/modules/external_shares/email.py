"""Invitation email for share links. Contains the link — never the access code or the secret."""

from datetime import UTC, datetime

from ...core.email_layout import EmailContent, render
from ...models import ExternalShare


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
    details = [("Access", access), ("Expires", expires)]
    if share.code_hash:
        details.append(("Access code", f"Required — {sender} will send it to you separately, not by email"))

    return render(
        EmailContent(
            subject=f"{sender} shared a password with you",
            heading=f"{sender} shared a password with you",
            paragraphs=["Open it securely in your browser. You don't need a Vaultessa account."],
            button=("View password", link),
            details=details,
            footnote="End-to-end encrypted — Vaultessa can't read what's inside. If you weren't expecting this, ignore this email.",
            mark="unlock",
        )
    )
