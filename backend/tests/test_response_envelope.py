import pytest
from fastapi import BackgroundTasks, FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.core.errors import AppError, error_response, register_error_handlers
from app.utils.validation.json_validator import ApiJSONResponse, JsonResponse

from .helpers import register


def test_public_success_and_message_response(client):
    result = client.get("/api/auth/email/policy")
    assert result.json() == {
        "status": "success",
        "message": "Success",
        "data": {"resendAfterSeconds": 45, "codeTtlMinutes": 10},
    }


def test_validation_error_does_not_echo_input(client):
    result = client.post("/api/auth/email/verify-code", json={"email": "invalid", "code": "private-value"})
    body = result.json()
    assert result.status_code == 400 and body["status"] == "error"
    assert body["data"]["code"] == "VALIDATION_ERROR"
    assert body["data"]["details"]
    assert "private-value" not in result.text


def test_not_found_and_method_errors_keep_envelope_and_headers(client):
    missing = client.get("/api/does-not-exist")
    assert missing.status_code == 404 and missing.json()["data"]["code"] == "NOT_FOUND"
    wrong_method = client.put("/api/auth/email/policy")
    assert wrong_method.status_code == 405 and wrong_method.json()["status"] == "error"
    assert "GET" in wrong_method.headers["allow"]


def test_authenticated_dto_and_bodyless_logout(api):
    user = register(api, "envelope", verified=False)
    result = api.get("/api/auth/me", headers=user.headers)
    body = result.json()
    assert result.status_code == 200 and body["status"] == "success"
    assert body["data"]["id"] == user.id
    assert "authHash" not in body["data"] and "emailVerificationCodeHash" not in body["data"]
    blocked = api.get("/api/secrets", headers=user.headers)
    assert blocked.json()["data"]["code"] == "EMAIL_NOT_VERIFIED"
    response = api.post("/api/auth/logout")
    assert response.status_code == 204 and response.content == b""
    assert "Max-Age=0" in response.headers["set-cookie"]


def test_health_failure_uses_error_envelope(client, monkeypatch):
    def fail(*args):
        raise SQLAlchemyError("private connection details")

    monkeypatch.setattr("app.api.health.text", fail)
    response = client.get("/api/health")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "error"
    assert body["message"] == "Database unavailable"
    assert body["data"]["code"] == "SERVICE_UNAVAILABLE"
    assert body["data"]["db"] == "unreachable"
    assert body["data"]["schema"] == "unknown"
    assert "private connection" not in response.text


def test_background_tasks_dto_filtering_and_errors_use_shared_helper():
    app = FastAPI(default_response_class=ApiJSONResponse)
    register_error_handlers(app)
    tasks = []

    class Public(BaseModel):
        id: int

    @app.get("/model", response_model=Public)
    def model(background: BackgroundTasks):
        background.add_task(tasks.append, "success")
        return {"id": 1, "private": "not-for-the-wire"}

    @app.get("/failure")
    def failure(background: BackgroundTasks):
        background.add_task(tasks.append, "failure")
        return error_response(AppError.bad_request("Could not complete action"), background)

    @app.get("/accepted", status_code=202)
    def accepted():
        return {"message": "Check your inbox", "resendAfterSeconds": 45}

    @app.get("/message")
    def message():
        return {"message": "Email verified"}

    with TestClient(app) as client:
        assert client.get("/model").json() == {"status": "success", "message": "Success", "data": {"id": 1}}
        assert client.get("/failure").json() == {
            "status": "error",
            "message": "Could not complete action",
            "data": {"code": "VALIDATION_ERROR"},
        }
        accepted_response = client.get("/accepted")
        assert accepted_response.status_code == 202
        assert accepted_response.json() == {
            "status": "success",
            "message": "Check your inbox",
            "data": {"resendAfterSeconds": 45},
        }
        assert client.get("/message").json() == {
            "status": "success",
            "message": "Email verified",
            "data": None,
        }
    assert tasks == ["success", "failure"]


def test_openapi_documents_envelopes_but_remains_a_standard_document(client):
    schema = client.get("/api/openapi.json").json()
    assert "openapi" in schema and "status" not in schema
    operation = schema["paths"]["/api/auth/me"]["get"]["responses"]
    success = operation["200"]["content"]["application/json"]["schema"]
    assert set(success["properties"]) == {"status", "message", "data"}
    assert success["properties"]["data"]["$ref"].endswith("/Account")
    assert operation["401"]["content"]["application/json"]["schema"]["$ref"].endswith("/ApiErrorEnvelope")
    assert "content" not in schema["paths"]["/api/auth/logout"]["post"]["responses"]["204"]


def test_user_helper_encodes_validation_without_sensitive_context():
    class Body(BaseModel):
        count: int = Field(gt=0)

    with pytest.raises(ValidationError) as error:
        Body(count="private-value")
    result = JsonResponse.validation_error(error.value)
    assert result.status_code == 422
    assert b"private-value" not in result.body
