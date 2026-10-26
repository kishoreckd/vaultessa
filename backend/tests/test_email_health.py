import smtplib
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import health
from app.core.errors import AppError
from app.services import email_health
from app.services.email_config import EmailConfig
from app.services.email_service import EmailDeliveryResult


@pytest.fixture
def smtp(monkeypatch):
    monkeypatch.setattr(
        email_health,
        "get_email_config",
        lambda: EmailConfig(
            "smtp-relay.brevo.com", 587, "private@example.com", "private-login", "private-key", True
        ),
    )
    monkeypatch.setattr(email_health, "get_settings", lambda: SimpleNamespace(smtp_timeout_seconds=10))
    client = MagicMock()
    client.__enter__.return_value = client
    client.noop.return_value = (250, b"OK")
    monkeypatch.setattr(email_health.smtplib, "SMTP", lambda *a, **kw: client)
    return client


def test_probe_authenticates_without_sending_or_disclosing_secrets(smtp):
    result = email_health.check_email_connection()
    assert result["stage"] == "complete"
    assert result["tls"] == "verified"
    assert result["authentication"] == "authenticated"
    assert result["delivery"] == "not_tested"
    smtp.send_message.assert_not_called()
    smtp.sendmail.assert_not_called()
    assert "private" not in str(result)


def test_probe_hides_authentication_error_response(smtp):
    smtp.login.side_effect = smtplib.SMTPAuthenticationError(535, b"private-key private@example.com")
    result = email_health.check_email_connection()
    assert result["stage"] == "authenticate"
    assert result["smtpCode"] == 535
    assert result["authentication"] == "failed"
    assert "private" not in str(result)


def test_probe_reports_connection_timeout(monkeypatch, smtp):
    def timeout(*a, **kw):
        raise TimeoutError("private host")

    monkeypatch.setattr(email_health.smtplib, "SMTP", timeout)
    result = email_health.check_email_connection()
    assert result["stage"] == "connect"
    assert result["connection"] == "failed"
    assert "private" not in str(result)


def test_missing_configuration(monkeypatch):
    monkeypatch.setattr(email_health, "get_email_config", lambda: None)
    assert email_health.check_email_connection()["code"] == "EMAIL_NOT_CONFIGURED"


def test_route_wraps_and_caches_probe(smtp, monkeypatch):
    monkeypatch.setattr(health, "_email_check_cached", None)
    app = FastAPI()
    app.include_router(health.router, prefix="/api")
    with TestClient(app) as client:
        for _ in range(2):
            response = client.get("/api/health/email")
            assert response.status_code == 200
            assert response.json()["status"] == "success"
            assert response.json()["data"]["delivery"] == "not_tested"
    smtp.login.assert_called_once()


def test_route_returns_503_for_missing_configuration(monkeypatch):
    monkeypatch.setattr(health, "_email_check_cached", None)
    monkeypatch.setattr(email_health, "get_email_config", lambda: None)
    app = FastAPI()
    app.include_router(health.router, prefix="/api")
    with TestClient(app) as client:
        response = client.get("/api/health/email")
    assert response.status_code == 503
    assert response.json()["status"] == "error"


def test_test_send_uses_account_email_and_returns_correlation(monkeypatch):
    db = MagicMock()
    db.scalar.side_effect = [SimpleNamespace(email="owner@example.com"), None]
    enqueue = MagicMock(return_value=uuid4())
    monkeypatch.setattr(health.email_outbox_service, "enqueue", enqueue)
    send = MagicMock(return_value=EmailDeliveryResult("accepted", "SMTP accepted", "<test@example.com>"))
    monkeypatch.setattr(health, "send_email", send)
    monkeypatch.setattr(
        health.email_outbox_service,
        "deliver",
        lambda item, sender: sender("owner@example.com", "Test", "Test body", None),
    )
    response = health.send_test_email(SimpleNamespace(user_id=uuid4()), db)
    assert response.status_code == 202
    assert enqueue.call_args.args[0] == "owner@example.com"
    assert b'"messageId":"<test@example.com>"' in response.body
    assert b'"delivery":"not_confirmed"' in response.body


def test_test_send_throttles_before_sending(monkeypatch):
    db = MagicMock()
    db.scalar.side_effect = [SimpleNamespace(email="owner@example.com"), uuid4()]
    enqueue = MagicMock()
    monkeypatch.setattr(health.email_outbox_service, "enqueue", enqueue)
    with pytest.raises(AppError):
        health.send_test_email(SimpleNamespace(user_id=uuid4()), db)
    enqueue.assert_not_called()


def test_test_send_requires_authentication():
    app = FastAPI()
    app.include_router(health.router, prefix="/api")
    from app.core.errors import register_error_handlers

    register_error_handlers(app)
    with TestClient(app) as client:
        assert client.post("/api/health/email").status_code == 401
