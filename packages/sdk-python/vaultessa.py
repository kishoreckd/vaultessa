"""Read selected Vaultessa secrets without sending decryption keys to the server."""

import base64
import json
import uuid
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Vaultessa redirects are not allowed")


def _derive(root: bytes, info: bytes) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=b"", info=info).derive(root)


def _decrypt(key: bytes, value: str) -> bytes:
    version, iv, ciphertext = value.split(".")
    if version != "v1":
        raise ValueError("Unsupported ciphertext")
    return AESGCM(key).decrypt(
        base64.b64decode(iv, validate=True),
        base64.b64decode(ciphertext, validate=True),
        None,
    )


class VaultessaClient:
    def __init__(self, url: str, token: str):
        origin = urlparse(url)
        if origin.scheme != "https" and not (
            origin.scheme == "http"
            and origin.hostname in ("localhost", "127.0.0.1", "::1")
        ):
            raise ValueError("Use HTTPS for Vaultessa")
        if (
            not origin.hostname
            or origin.username
            or origin.password
            or origin.query
            or origin.fragment
        ):
            raise ValueError("Invalid Vaultessa URL")
        prefix, token_id, encoded = token.split(".")
        uuid.UUID(token_id)
        root = base64.b64decode(encoded, validate=True)
        if prefix != "pvm" or len(root) != 32:
            raise ValueError("Invalid Vaultessa token")
        auth = base64.b64encode(_derive(root, b"passvault-token-auth")).decode()
        self._credential = f"pvm.{token_id}.{auth}"
        self._key = _derive(root, b"passvault-token-enc")
        self._url = url.rstrip("/")

    def list(self) -> list[dict]:
        request = Request(
            f"{self._url}/api/machine/secrets",
            headers={"Authorization": f"Bearer {self._credential}"},
        )
        try:
            with build_opener(_NoRedirect()).open(request, timeout=15) as response:
                envelope = json.load(response)
                if (
                    not isinstance(envelope, dict)
                    or envelope.get("status") != "success"
                    or not isinstance(envelope.get("data"), list)
                ):
                    raise RuntimeError("Invalid Vaultessa response")
                rows = envelope["data"]
        except HTTPError as exc:
            raise RuntimeError(f"Vaultessa request failed ({exc.code})") from None
        return [
            {
                "id": row["id"],
                "type": row["type"],
                "revision": row["revision"],
                "data": json.loads(
                    _decrypt(
                        _decrypt(self._key, row["wrappedKey"]), row["encryptedData"]
                    )
                ),
            }
            for row in rows
        ]

    def get(self, item_id: str) -> dict:
        for item in self.list():
            if item["id"] == item_id:
                return item
        raise KeyError("Item not found or access was revoked")
