import logging
import smtplib
from email.message import EmailMessage

from ..config import get_settings

logger = logging.getLogger("vaultessa.mail")


def email_enabled() -> bool:
    return bool(get_settings().smtp_host)


def send_email(to: str, subject: str, text: str, html: str | None = None) -> None:
    """Sends synchronously; call from a BackgroundTask so requests don't wait on SMTP."""
    settings = get_settings()
    if not settings.smtp_host:
        return
    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text)
    if html:
        message.add_alternative(html, subtype="html")
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_starttls:
                smtp.starttls()
            if settings.smtp_username and settings.smtp_password:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException):
        # Never log the message body: it can contain a share link.
        logger.exception("failed to send email to %s", to)
