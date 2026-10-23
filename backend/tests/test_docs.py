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


@pytest.mark.parametrize("path", ["/api/docs", "/api/openapi.json"])
def test_docs_require_basic_authentication(docs_client, path):
    for credentials in (
        None,
        ("wrong-user", "dedicated-fixture-password-12345"),
        ("docs-test-user", "wrong-password"),
    ):
        response = docs_client.get(path, auth=credentials)
        assert response.status_code == 401
        assert response.headers["www-authenticate"].startswith("Basic")
        assert response.json()["status"] == "error"
        assert response.headers["cache-control"] == "no-store"


def test_authenticated_docs_and_schema_and_cached_schema_stays_protected(docs_client):
    credentials = ("docs-test-user", "dedicated-fixture-password-12345")
    response = docs_client.get("/api/docs", auth=credentials)
    assert response.status_code == 200 and "text/html" in response.headers["content-type"]
    assert "/api/openapi.json" in response.text and "SwaggerUIBundle" in response.text
    assert credentials[1] not in response.text
    schema = docs_client.get("/api/openapi.json", auth=credentials)
    assert schema.status_code == 200 and "openapi" in schema.json()
    assert "/api/docs" not in schema.json()["paths"]
    assert "/api/openapi.json" not in schema.json()["paths"]
    assert schema.json()["paths"]["/api/auth/me"]["get"]["responses"]["200"]["content"]["application/json"][
        "schema"
    ]["properties"]["status"]
    assert credentials[1] not in schema.text
    assert docs_client.get("/api/openapi.json").status_code == 401
    assert docs_client.get("/api/auth/email/policy").status_code == 200
    # Documentation credentials do not replace application session/JWT authentication.
    assert docs_client.get("/api/secrets", auth=credentials).status_code == 401


@pytest.mark.parametrize("header", ["Bearer not-a-session", "Basic !!!", "Basic dXNlcg=="])
def test_invalid_authorization_headers_cannot_open_schema(docs_client, header):
    response = docs_client.get("/api/openapi.json", headers={"Authorization": header})
    assert response.status_code == 401 and "www-authenticate" in response.headers


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
    assert client.get("/api/docs").status_code == 401
    response = client.get("/api/docs")
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
