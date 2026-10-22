"""Multipart SMTP delivery with typed results and local inline artwork."""

import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Literal

from app.constants.email import EMAIL_ASSETS
from app.core.config import get_settings
from app.services.email_config import email_enabled, get_email_config

__all__ = ["email_enabled", "send_email", "EmailDeliveryResult"]
logger = logging.getLogger("vaultessa.mail")


@dataclass(frozen=True)
class EmailDeliveryResult:
    status: Literal["accepted", "failed", "unconfigured"]
    message: str


def send_email(to: str, subject: str, text: str, html: str | None = None) -> EmailDeliveryResult:
    config = get_email_config()
    if config is None:
        return EmailDeliveryResult("unconfigured", "Email delivery is not configured.")
    message = EmailMessage()
    message["From"], message["To"], message["Subject"] = config.sender, to, " ".join(subject.splitlines())
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
    try:
        connect = smtplib.SMTP_SSL if config.port == 465 else smtplib.SMTP
        options = {"timeout": get_settings().smtp_timeout_seconds}
        if config.port == 465:
            options["context"] = ssl.create_default_context()
        with connect(config.host, config.port, **options) as smtp:
            if config.starttls and config.port != 465:
                smtp.starttls(context=ssl.create_default_context())
            if config.username and config.password:
                smtp.login(config.username, config.password)
            refused = smtp.send_message(message)
            if refused:
                return EmailDeliveryResult("failed", "The mail server rejected the recipient.")
        return EmailDeliveryResult(
            "accepted", "The mail server accepted the email. Inbox delivery is not yet confirmed."
        )
    except (OSError, smtplib.SMTPException):
        # SMTP exceptions can include credentials, addresses or message details. Do not echo them.
        logger.warning("SMTP delivery failed; message content and credentials omitted")
        return EmailDeliveryResult(
            "failed", "Email could not be sent. Please try again or copy the secure link."
        )
