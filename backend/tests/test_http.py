"""HTTP-layer behaviour that never reaches the database."""

from .helpers import response_data


def test_protected_routes_require_a_token(client):
    response = client.get("/api/secrets")
    assert response.status_code == 401
    assert response_data(response) == {
        "error": {"code": "UNAUTHORIZED", "message": "Authentication required"}
    }


def test_forged_token_is_rejected(client):
    response = client.get("/api/folders", headers={"Authorization": "Bearer not.a.jwt"})
    assert response.status_code == 401


def test_validation_errors_use_the_standard_shape(client):
    response = client.post("/api/auth/login", json={"email": "nope"})
    assert response.status_code == 400
    body = response_data(response)["error"]
    assert body["code"] == "VALIDATION_ERROR"
    assert {d["path"] for d in body["details"]} == {"email", "authHash"}


def test_unknown_fields_are_rejected(client):
    # A buggy client sending a plaintext master password must be refused, not silently ignored.
    response = client.post("/api/auth/prelogin", json={"email": "a@b.co", "masterPassword": "plaintext!"})
    assert response.status_code == 400


def test_unknown_routes_return_json_404(client):
    response = client.get("/api/nope")
    assert response.status_code == 404
    assert response_data(response)["error"]["code"] == "NOT_FOUND"


def test_security_headers(client):
    headers = client.get("/api/nope").headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert headers["cache-control"] == "no-store"
    assert "default-src 'none'" in headers["content-security-policy"]
