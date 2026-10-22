"""SMTP settings boundary. Credentials come from backend secrets, never from templates."""

from dataclasses import dataclass, field

from app.core.config import get_settings


@dataclass(frozen=True)
class EmailConfig:
    host: str
    port: int
    sender: str
    username: str | None = None
    password: str | None = field(default=None, repr=False)
    starttls: bool = False


def get_email_config() -> EmailConfig | None:
    settings = get_settings()
    if not settings.smtp_host or not settings.smtp_from:
        return None
    if bool(settings.smtp_username) != bool(settings.smtp_password):
        return None
    if settings.is_production and not settings.smtp_starttls and settings.smtp_port != 465:
        return None
    return EmailConfig(
        settings.smtp_host,
        settings.smtp_port,
        settings.smtp_from,
        settings.smtp_username,
        settings.smtp_password,
        settings.smtp_starttls,
    )


def email_enabled() -> bool:
    return get_email_config() is not None
