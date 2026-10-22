import importlib.util
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.services import notifications_service as notify


def settings(**overrides):
    values = {
        "environment": "production",
        "database_url": "postgresql://db.example/vault",
        "app_base_url": "https://vault.company.example",
        "cors_origins": ["https://vault.company.example"],
        "jwt_access_secret": "a" * 32,
        "prelogin_secret": "b" * 32,
        "mfa_encryption_key": "c" * 32,
        "smtp_host": None,
        **overrides,
    }
    return Settings(_env_file=None, **values)


@pytest.mark.parametrize("url", ["http://localhost:5173", "https://127.0.0.1", "https://vault.local"])
def test_production_rejects_local_email_urls(url):
    with pytest.raises(ValidationError):
        settings(app_base_url=url)


def test_config_accepts_deployed_origin_and_normalizes_trailing_slash():
    config = settings(app_base_url="https://vault.company.example/")
    assert config.app_base_url == "https://vault.company.example"
    assert config.database_url.startswith("postgresql+psycopg://")


@pytest.mark.parametrize(
    "overrides",
    [
        {"scrypt_n": 32769},
        {"scrypt_n": 65536, "scrypt_maxmem": 67108864},
        {"scrypt_dklen": 8},
        {"jwt_algorithm": "none"},
        {"totp_digits": 8},
        {"max_failed_logins": 0},
    ],
)
def test_security_policy_rejects_invalid_or_incompatible_configuration(overrides):
    with pytest.raises(ValidationError):
        settings(**overrides)


def test_scrypt_hashes_remain_verifiable_after_policy_change(monkeypatch):
    from app.core import security

    original = settings()
    monkeypatch.setattr(security, "get_settings", lambda: original)
    old_hash = security.hash_auth_key("client-derived-auth")
    updated = settings(scrypt_n=65536, scrypt_maxmem=134217728, scrypt_dklen=48)
    monkeypatch.setattr(security, "get_settings", lambda: updated)
    assert security.verify_auth_key("client-derived-auth", old_hash)
    assert not security.verify_auth_key("wrong-auth", old_hash)
    new_hash = security.hash_auth_key("client-derived-auth")
    assert new_hash.split("$")[1] == "65536"
    assert security.verify_auth_key("client-derived-auth", new_hash)


def test_rate_limit_reads_central_policy(monkeypatch):
    from fastapi import Request

    from app.core import rate_limit
    from app.core.errors import AppError

    config = settings(rate_limit_enabled=True, rate_limit_auth_requests=1)
    monkeypatch.setattr(rate_limit, "get_settings", lambda: config)
    limiter = rate_limit.RateLimiter("rate_limit_auth_requests", "test")
    request = Request({"type": "http", "client": ("192.0.2.1", 12345)})
    limiter(request)
    with pytest.raises(AppError):
        limiter(request)


def test_every_preview_uses_configured_app_origin(tmp_path, monkeypatch):
    script = Path(__file__).resolve().parents[1] / "scripts/preview_emails.py"
    spec = importlib.util.spec_from_file_location("preview_emails", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    config = settings(app_base_url="https://vault.company.example", account_lock_minutes=15)
    monkeypatch.setattr(module, "get_settings", lambda: config)
    monkeypatch.setattr(module.templates, "get_settings", lambda: config)
    monkeypatch.setattr(notify, "get_settings", lambda: config)
    monkeypatch.setattr(notify, "email_enabled", lambda: False)
    monkeypatch.setattr(module, "__file__", str(tmp_path / "scripts/preview_emails.py"))
    monkeypatch.setattr(sys, "argv", [str(script)])
    (tmp_path / "app").mkdir()
    module.main()
    pages = list((tmp_path / "app/email_previews").glob("*.html"))
    assert len(pages) == 43
    for page in pages:
        if page.name == "index.html":
            continue
        html = page.read_text(encoding="utf-8")
        assert 'href="https://vault.company.example' in html, page.name
        assert "127.0.0.1" not in html and "localhost" not in html
        assert "vaultessa.example" not in html
