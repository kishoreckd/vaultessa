import uuid

import jwt
import pytest

from app.core.security import (
    create_access_token,
    decode_access_token,
    fake_kdf_salt,
    hash_auth_key,
    sha256_hex,
    verify_auth_key,
)


def test_auth_key_hash_verifies_and_rejects_wrong_value():
    stored = hash_auth_key("client-auth-hash")
    assert stored.startswith("scrypt$32768$8$1$")
    assert verify_auth_key("client-auth-hash", stored)
    assert not verify_auth_key("wrong", stored)


def test_auth_key_hash_uses_fresh_salt():
    assert hash_auth_key("same") != hash_auth_key("same")


def test_malformed_stored_hash_is_rejected():
    assert not verify_auth_key("x", "not-a-hash")
    assert not verify_auth_key("x", "bcrypt$1$2$3$c2FsdA==$aGFzaA==")


def test_fake_salt_is_deterministic_16_bytes_per_email():
    a = fake_kdf_salt("a@example.com", "secret")
    assert a == fake_kdf_salt("a@example.com", "secret")
    assert a != fake_kdf_salt("b@example.com", "secret")
    import base64

    assert len(base64.b64decode(a)) == 16


def test_access_token_round_trip_and_tamper_detection():
    user_id, session_id = uuid.uuid4(), uuid.uuid4()
    token = create_access_token(user_id, session_id)
    assert decode_access_token(token) == (user_id, session_id)

    forged = jwt.encode({"sub": str(user_id), "sid": str(session_id), "exp": 9999999999}, "x" * 40, "HS256")
    with pytest.raises(jwt.InvalidSignatureError):
        decode_access_token(forged)


def test_sha256_hex():
    assert len(sha256_hex("abc")) == 64
