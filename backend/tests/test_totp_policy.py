from types import SimpleNamespace

from app.core import totp
from app.services import account_service

SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"


def test_totp_rfc_vector_and_thirty_second_rotation():
    assert totp.code_at(SECRET, 1) == "287082"
    assert totp.matching_counter(SECRET, "287082", now=59, window=0) == 1
    assert totp.matching_counter(SECRET, "287082", now=60, window=0) is None
    assert "period=30" in totp.otpauth_uri(SECRET, "test@example.com")


def test_totp_clock_tolerance_is_one_step():
    for counter in (99, 100, 101):
        assert totp.matching_counter(SECRET, totp.code_at(SECRET, counter), now=3000) == counter
    assert totp.matching_counter(SECRET, totp.code_at(SECRET, 98), now=3000) is None
    assert totp.matching_counter(SECRET, totp.code_at(SECRET, 102), now=3000) is None


def test_used_authenticator_code_cannot_be_replayed(monkeypatch):
    monkeypatch.setattr(account_service, "unseal", lambda value: SECRET)
    monkeypatch.setattr(totp, "matching_counter", lambda *args: 100)
    user = SimpleNamespace(totp_enabled=True, mfa_secret_enc="sealed", mfa_last_counter=99)
    assert account_service.verify_second_factor(user, "totp", "123456")
    assert not account_service.verify_second_factor(user, "totp", "123456")


def test_recovery_code_is_single_use():
    code = "ABCDEF123456"
    user = SimpleNamespace(mfa_recovery_hashes=[totp.hash_recovery_code(code)])
    assert account_service.verify_second_factor(user, "recovery", code)
    assert not account_service.verify_second_factor(user, "recovery", code)
