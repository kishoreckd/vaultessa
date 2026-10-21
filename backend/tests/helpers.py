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


def register(api: TestClient, name: str) -> ApiUser:
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
    body = response.json()
    return ApiUser(id=body["account"]["id"], email=email, auth_hash=auth_hash, token=body["accessToken"])


def create_secret(api: TestClient, user: ApiUser, **overrides) -> dict:
    payload = {"type": "LOGIN", "encryptedData": ENC, "wrappedKey": ENC, **overrides}
    response = api.post("/api/secrets", json=payload, headers=user.headers)
    assert response.status_code == 201, response.text
    return response.json()


def share(api: TestClient, owner: ApiUser, secret_id: str, recipient: ApiUser, permission: str):
    return api.post(
        f"/api/secrets/{secret_id}/shares",
        json={"userId": recipient.id, "wrappedKey": RSA_WRAPPED, "permission": permission},
        headers=owner.headers,
    )
