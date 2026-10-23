import smtplib
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.services import email_service as mail
from app.services.email_config import EmailConfig


@pytest.fixture
def smtp(monkeypatch):
    config = EmailConfig(
        "smtp-relay.brevo.com", 587, "sender@example.com", "smtp-login", "secret-password", True
    )
    monkeypatch.setattr(mail, "get_email_config", lambda: config)
    monkeypatch.setattr(mail, "get_settings", lambda: SimpleNamespace(smtp_timeout_seconds=10))
    client = MagicMock()
    client.__enter__.return_value = client
    client.send_message.return_value = {}
    monkeypatch.setattr(mail.smtplib, "SMTP", lambda *args, **kwargs: client)
    return client


def test_acceptance_is_logged_with_a_message_id_without_message_contents(smtp, monkeypatch):
    info = MagicMock()
    monkeypatch.setattr(mail.logger, "info", info)
    result = mail.send_email("recipient@example.com", "Private subject", "Private contents")
    assert result.status == "accepted"
    assert smtp.send_message.call_args.args[0]["Message-ID"]
    logs = str(info.call_args_list)
    assert "SMTP accepted" in logs and "brevo" in logs
    for secret in [
        "secret-password",
        "smtp-login",
        "recipient@example.com",
        "Private subject",
        "Private contents",
    ]:
        assert secret not in logs


def test_authentication_failure_retains_safe_stage_and_numeric_code(smtp, monkeypatch):
    smtp.login.side_effect = smtplib.SMTPAuthenticationError(535, b"secret-password recipient@example.com")
    warning = MagicMock()
    monkeypatch.setattr(mail.logger, "warning", warning)
    result = mail.send_email("recipient@example.com", "Subject", "Contents")
    assert result.status == "failed"
    assert "stage=authenticate" in result.message and "535" in result.message
    assert "secret-password" not in result.message + str(warning.call_args_list)
    assert "recipient@example.com" not in result.message + str(warning.call_args_list)


def test_tls_timeout_is_distinguished_from_authentication(smtp):
    smtp.starttls.side_effect = TimeoutError("private connection details")
    result = mail.send_email("recipient@example.com", "Subject", "Contents")
    assert result.status == "failed"
    assert "stage=starttls" in result.message and "TimeoutError" in result.message
    assert "private connection details" not in result.message
