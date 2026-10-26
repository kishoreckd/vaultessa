"""Non-delivery SMTP probe. Never returns server response text or credentials."""

import smtplib
import ssl
from time import perf_counter

from app.core.config import get_settings
from app.services.email_config import get_email_config


def check_email_connection() -> dict:
    result = {
        "configuration": "not_configured",
        "connection": "not_tested",
        "tls": "not_tested",
        "authentication": "not_tested",
        "delivery": "not_tested",
        "stage": "configuration",
        "latencyMs": None,
    }
    config = get_email_config()
    if config is None:
        result["code"] = "EMAIL_NOT_CONFIGURED"
        return result
    result["configuration"] = "configured"
    started = perf_counter()
    stage = "connect"
    try:
        options = {"timeout": min(get_settings().smtp_timeout_seconds, 10)}
        connect = smtplib.SMTP_SSL if config.port == 465 else smtplib.SMTP
        if config.port == 465:
            options["context"] = ssl.create_default_context()
        with connect(config.host, config.port, **options) as smtp:
            result["connection"] = "connected"
            stage = "tls"
            if config.port == 465:
                result["tls"] = "verified"
            elif config.starttls:
                smtp.starttls(context=ssl.create_default_context())
                result["tls"] = "verified"
            else:
                result["tls"] = "disabled"
            stage = "authenticate"
            if config.username and config.password:
                smtp.login(config.username, config.password)
                result["authentication"] = "authenticated"
            else:
                result["authentication"] = "not_required"
            stage = "noop"
            code, _ = smtp.noop()
            if code != 250:
                raise smtplib.SMTPResponseException(code, b"")
            stage = "close"
        result["stage"] = "complete"
    except (OSError, smtplib.SMTPException) as error:
        result["stage"] = stage
        result["code"] = "SMTP_CHECK_FAILED"
        result["errorType"] = type(error).__name__
        if isinstance(error, smtplib.SMTPResponseException):
            result["smtpCode"] = error.smtp_code
        field = {"connect": "connection", "tls": "tls", "authenticate": "authentication"}.get(stage)
        if field:
            result[field] = "failed"
    result["latencyMs"] = round((perf_counter() - started) * 1000, 2)
    return result
