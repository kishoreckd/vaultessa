from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import account
from app.services import notifications_service as notify


def test_email_settings_catalog_and_saved_preferences(monkeypatch):
    user = SimpleNamespace(email="owner@example.com", notification_prefs={"sharing": False})
    monkeypatch.setattr(account, "get_user", lambda *args: user)
    monkeypatch.setattr(account, "email_enabled", lambda: False)
    result = account.email_notification_details(SimpleNamespace(user_id="owner"), MagicMock())
    assert result.recipient == "owner@example.com"
    assert result.configured is False
    assert result.delivery == "not_tested"
    assert result.preferences.sharing is False
    assert result.preferences.links is True
    assert result.preferences.expiry is True
    assert {c.key for c in result.categories if not c.required} == {
        c.value for c in notify.OPTIONAL_CATEGORIES
    }
    assert [c.key for c in result.categories if c.required] == ["security"]
    assert notify._enabled(user, notify.Category.SECURITY) is True
    assert notify._enabled(user, notify.Category.SHARING) is False


def test_email_settings_requires_authenticated_account():
    app = FastAPI()
    app.include_router(account.router, prefix="/api")
    from app.core.errors import register_error_handlers

    register_error_handlers(app)
    with TestClient(app) as client:
        assert client.get("/api/account/notifications/details").status_code == 401
