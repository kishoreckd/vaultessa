import base64
from dataclasses import dataclass

from fastapi.testclient import TestClient

# The server never inspects ciphertext, so tests use opaque but well-formed values.
ENC = "v1.AAAAAAAAAAAAAAAA.Y2lwaGVydGV4dA=="
ENC_2 = "v1.BBBBBBBBBBBBBBBB.c2Vjb25kIHZlcnNpb24="
RSA_WRAPPED = base64.b64encode(b"rsa-wrapped-secret-key").decode()


def b64(value: str) -> str:
    return base64.b64encode(value.encode()).decode()


@dataclass
class ApiUser:
    id: str
    email: str
    auth_hash: str
    token: str

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}


def register(api: TestClient, name: str, *, verified: bool = True) -> ApiUser:
    email = f"{name}@example.com"
    auth_hash = b64(f"auth-hash-for-{name}")
    response = api.post(
        "/api/auth/register",
        json={
            "email": email,
            "name": name.title(),
            "authHash": auth_hash,
            "kdfIterations": 600_000,
            "kdfSalt": b64("sixteen-byte-slt"),
            "protectedVaultKey": ENC,
            "publicKey": b64(f"public-key-{name}"),
            "protectedPrivateKey": ENC,
        },
    )
    assert response.status_code == 201, response.text
    body = response_data(response)
    if verified:
        # Ordinary feature fixtures represent an already verified account. Verification tests opt out.
        import uuid

        from app.db.models.user_model import User
        from app.db.session import SessionLocal

        with SessionLocal() as db:
            db.get(User, uuid.UUID(body["account"]["id"])).email_verified = True
            db.commit()
    return ApiUser(id=body["account"]["id"], email=email, auth_hash=auth_hash, token=body["accessToken"])


def create_secret(api: TestClient, user: ApiUser, **overrides) -> dict:
    payload = {"type": "LOGIN", "encryptedData": ENC, "wrappedKey": ENC, **overrides}
    response = api.post("/api/secrets", json=payload, headers=user.headers)
    assert response.status_code == 201, response.text
    return response_data(response)


def share(api: TestClient, owner: ApiUser, secret_id: str, recipient: ApiUser, permission: str):
    return api.post(
        f"/api/secrets/{secret_id}/shares",
        json={"userId": recipient.id, "wrappedKey": RSA_WRAPPED, "permission": permission},
        headers=owner.headers,
    )


def response_data(response):
    """Assert the wire envelope, then expose domain data for behavioral assertions.

    Error assertions keep their existing local representation; raw envelope tests
    separately cover the transport contract and frontend/SDK decoding.
    """
    body = response.json()
    if response.request.url.path == "/api/openapi.json":
        return body
    assert set(body) == {"status", "message", "data"}, body
    assert body["status"] == ("success" if response.is_success else "error"), body
    assert isinstance(body["message"], str)
    data = body["data"]
    if body["status"] == "error":
        return {"error": {"message": body["message"], **data}}
    if data is None:
        return {"message": body["message"]}
    if isinstance(data, dict) and body["message"] != "Success":
        return {**data, "message": body["message"]}
    return data
