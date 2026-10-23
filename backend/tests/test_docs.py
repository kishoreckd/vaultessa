import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core import application
from app.core.config import Settings, get_settings


def configuration(**overrides):
    values = {
        **get_settings().model_dump(),
        "environment": "production",
        "app_base_url": "https://vaultessa.vercel.app",
        "cors_origins": ["https://vaultessa.vercel.app"],
        "enable_api_docs": True,
        "swagger_username": "docs-test-user",
        "swagger_password": "dedicated-fixture-password-12345",
        **overrides,
    }
    return Settings(_env_file=None, **values)


@pytest.fixture
def docs_client(monkeypatch):
    config = configuration()
    monkeypatch.setattr(application, "get_settings", lambda: config)
    return TestClient(application.create_app())


def test_login_page_and_schema_are_protected(docs_client):
    page = docs_client.get("/api/docs")
    assert page.status_code == 200 and "Welcome back" in page.text
    assert "SwaggerUIBundle" not in page.text
    assert "www-authenticate" not in page.headers
    schema = docs_client.get("/api/openapi.json")
    assert schema.status_code == 401
    assert "www-authenticate" not in schema.headers


def test_login_logout_and_cookie_security(docs_client):
    # HTTPS is required for the production Secure cookie.
    docs_client.base_url = "https://testserver"
    headers = {"Origin": "https://testserver"}
    credentials = {"username": "docs-test-user", "password": "dedicated-fixture-password-12345"}
    assert docs_client.post("/api/docs/login", json=credentials).status_code == 403
    assert (
        docs_client.post(
            "/api/docs/login", json={**credentials, "password": "wrong"}, headers=headers
        ).status_code
        == 401
    )
    response = docs_client.post("/api/docs/login", json=credentials, headers=headers)
    assert response.status_code == 200
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "Secure" in cookie and "SameSite=strict" in cookie
    assert credentials["password"] not in cookie
    page = docs_client.get("/api/docs")
    assert "SwaggerUIBundle" in page.text and "Sign out of docs" in page.text
    assert credentials["password"] not in page.text
    schema = docs_client.get("/api/openapi.json")
    assert schema.status_code == 200 and "openapi" in schema.json()
    assert "/api/docs/login" not in schema.json()["paths"]
    assert docs_client.get("/api/secrets").status_code == 401
    assert docs_client.post("/api/docs/logout", headers=headers).status_code == 200
    assert docs_client.get("/api/openapi.json").status_code == 401
    docs_client.cookies.set("vaultessa_docs", "tampered")
    assert docs_client.get("/api/openapi.json").status_code == 401


def test_production_docs_disabled_without_flag(monkeypatch):
    config = configuration(enable_api_docs=False, swagger_username=None, swagger_password=None)
    monkeypatch.setattr(application, "get_settings", lambda: config)
    client = TestClient(application.create_app())
    assert client.get("/api/docs").status_code == 404
    assert client.get("/api/openapi.json").status_code == 404


def test_development_docs_remain_available(monkeypatch):
    config = configuration(
        environment="development", enable_api_docs=False, swagger_username=None, swagger_password=None
    )
    monkeypatch.setattr(application, "get_settings", lambda: config)
    client = TestClient(application.create_app())
    assert client.get("/api/docs").status_code == 200
    assert client.get("/api/openapi.json").status_code == 200


def test_docs_login_attempts_are_rate_limited(monkeypatch):
    from app.core import docs, rate_limit

    config = configuration(rate_limit_enabled=True, rate_limit_auth_requests=1)
    monkeypatch.setattr(application, "get_settings", lambda: config)
    monkeypatch.setattr(rate_limit, "get_settings", lambda: config)
    monkeypatch.setattr(docs, "auth_limit", rate_limit.RateLimiter("rate_limit_auth_requests", "docs-test"))
    client = TestClient(application.create_app())
    assert client.get("/api/openapi.json").status_code == 401
    response = client.get("/api/openapi.json")
    assert response.status_code == 429
    assert response.json()["data"]["code"] == "RATE_LIMITED"


@pytest.mark.parametrize(
    "overrides",
    [
        {"swagger_username": None},
        {"swagger_username": "   "},
        {"swagger_username": "bad:user"},
        {"swagger_password": None},
        {"swagger_password": "short"},
    ],
)
def test_enabling_docs_rejects_missing_or_weak_credentials(overrides):
    with pytest.raises(ValidationError):
        configuration(**overrides)


def test_documentation_session_expires(docs_client, monkeypatch):
    from app.core import docs

    docs_client.base_url = "https://testserver"
    docs_client.post(
        "/api/docs/login",
        headers={"Origin": "https://testserver"},
        json={"username": "docs-test-user", "password": "dedicated-fixture-password-12345"},
    )

    def expired(*args, **kwargs):
        raise docs.jwt.ExpiredSignatureError()

    monkeypatch.setattr(docs.jwt, "decode", expired)
    assert docs_client.get("/api/openapi.json").status_code == 401
    assert "Welcome back" in docs_client.get("/api/docs").text
