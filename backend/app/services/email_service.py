"""Multipart SMTP delivery with typed results and local inline artwork."""

import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import make_msgid
from typing import Literal

from app.constants.email import EMAIL_ASSETS
from app.core.config import get_settings
from app.services.email_config import email_enabled, get_email_config

__all__ = ["email_enabled", "send_email", "EmailDeliveryResult"]
logger = logging.getLogger("vaultessa.mail")


def configure_mail_logging() -> None:
    """Emit safe delivery metadata even when the host has no application logging setup."""
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s %(name)s %(message)s"))
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False


@dataclass(frozen=True)
class EmailDeliveryResult:
    status: Literal["accepted", "failed", "unconfigured"]
    message: str
    message_id: str | None = None


def send_email(to: str, subject: str, text: str, html: str | None = None) -> EmailDeliveryResult:
    config = get_email_config()
    if config is None:
        logger.warning("SMTP skipped: email configuration is incomplete")
        return EmailDeliveryResult("unconfigured", "Email delivery is not configured.")
    message = EmailMessage()
    message["From"], message["To"], message["Subject"] = config.sender, to, " ".join(subject.splitlines())
    message["Message-ID"] = make_msgid(domain="vaultessa.invalid")
    message.set_content(text)
    if html:
        message.add_alternative(html, subtype="html")
        part = message.get_payload()[-1]
        for cid, path in EMAIL_ASSETS.items():
            if f"cid:{cid}" in html:
                try:
                    part.add_related(
                        path.read_bytes(),
                        maintype="image",
                        subtype="png",
                        cid=f"<{cid}>",
                        disposition="inline",
                    )
                except OSError:
                    logger.warning("Email artwork is unavailable; delivery skipped")
                    return EmailDeliveryResult(
                        "failed", "Email assets are unavailable. Please try again later."
                    )
    provider = "brevo" if config.host.lower().rstrip(".") == "smtp-relay.brevo.com" else "other"
    logger.info(
        "SMTP attempt: provider=%s port=%s starttls=%s authenticated=%s message_id=%s",
        provider,
        config.port,
        config.starttls,
        bool(config.username and config.password),
        message["Message-ID"],
    )
    stage = "connect"
    try:
        connect = smtplib.SMTP_SSL if config.port == 465 else smtplib.SMTP
        options = {"timeout": get_settings().smtp_timeout_seconds}
        if config.port == 465:
            options["context"] = ssl.create_default_context()
        with connect(config.host, config.port, **options) as smtp:
            if config.starttls and config.port != 465:
                stage = "starttls"
                smtp.starttls(context=ssl.create_default_context())
            if config.username and config.password:
                stage = "authenticate"
                smtp.login(config.username, config.password)
            stage = "send"
            refused = smtp.send_message(message)
            if refused:
                logger.warning(
                    "SMTP rejected recipient: provider=%s message_id=%s", provider, message["Message-ID"]
                )
                return EmailDeliveryResult("failed", "The mail server rejected the recipient.")
            stage = "close"
        logger.info("SMTP accepted: provider=%s message_id=%s", provider, message["Message-ID"])
        return EmailDeliveryResult(
            "accepted",
            "The mail server accepted the email. Inbox delivery is not yet confirmed.",
            str(message["Message-ID"]),
        )
    except (OSError, smtplib.SMTPException) as error:
        # SMTP exceptions can include credentials, addresses or message details. Do not echo them.
        code = error.smtp_code if isinstance(error, smtplib.SMTPResponseException) else None
        # Never include the exception's response text: it can contain secrets or personal data.
        detail = f"SMTP {code}" if isinstance(code, int) else type(error).__name__
        logger.warning(
            "SMTP failed: stage=%s detail=%s provider=%s message_id=%s",
            stage,
            detail,
            provider,
            message["Message-ID"],
        )
        return EmailDeliveryResult("failed", f"Email could not be sent: SMTP stage={stage}, {detail}.")
