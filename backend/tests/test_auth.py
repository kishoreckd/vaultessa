from .helpers import b64, register


def test_register_then_login_and_me(api):
    alice = register(api, "alice")
    me = api.get("/api/auth/me", headers=alice.headers)
    assert me.status_code == 200
    assert me.json()["email"] == "alice@example.com"
    assert "authHash" not in me.json()

    login = api.post("/api/auth/login", json={"email": "ALICE@example.com ", "authHash": alice.auth_hash})
    assert login.status_code == 200
    assert login.json()["account"]["kdfIterations"] == 600_000
    assert "pv_refresh" in login.cookies


def test_duplicate_registration_conflicts(api):
    register(api, "alice")
    response = api.post(
        "/api/auth/register",
        json={
            "email": "alice@example.com",
            "name": "A",
            "authHash": b64("x"),
            "kdfIterations": 600_000,
            "kdfSalt": b64("salt"),
            "protectedVaultKey": "v1.AA.BB",
            "publicKey": b64("pk"),
            "protectedPrivateKey": "v1.AA.BB",
        },
    )
    assert response.status_code == 409


def test_wrong_password_is_rejected_and_audited(api):
    alice = register(api, "alice")
    response = api.post("/api/auth/login", json={"email": alice.email, "authHash": b64("wrong")})
    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Invalid email or master password"
    unknown = api.post("/api/auth/login", json={"email": "ghost@example.com", "authHash": b64("x")})
    assert unknown.json() == response.json()  # same answer whether or not the account exists


def test_prelogin_does_not_reveal_unknown_emails(api):
    register(api, "alice")
    real = api.post("/api/auth/prelogin", json={"email": "alice@example.com"}).json()
    fake = api.post("/api/auth/prelogin", json={"email": "ghost@example.com"}).json()
    assert set(real) == set(fake) == {"kdf", "kdfIterations", "kdfSalt"}
    assert api.post("/api/auth/prelogin", json={"email": "ghost@example.com"}).json() == fake


def test_refresh_rotates_and_logout_revokes(api):
    alice = register(api, "alice")
    old_cookie = api.cookies.get("pv_refresh")

    refreshed = api.post("/api/auth/refresh")
    assert refreshed.status_code == 200
    new_token = refreshed.json()["accessToken"]

    reused = api.post("/api/auth/refresh", headers={"Cookie": f"pv_refresh={old_cookie}"})
    assert reused.status_code == 401  # rotated token is dead

    assert api.post("/api/auth/logout").status_code == 204
    for token in (alice.token, new_token):
        assert api.get("/api/secrets", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_register_rejects_weak_kdf_and_bad_ciphertext(api):
    base = {
        "email": "bob@example.com",
        "name": "Bob",
        "authHash": b64("x"),
        "kdfSalt": b64("salt"),
        "publicKey": b64("pk"),
        "protectedPrivateKey": "v1.AA.BB",
    }
    weak = api.post(
        "/api/auth/register", json={**base, "kdfIterations": 1000, "protectedVaultKey": "v1.AA.BB"}
    )
    assert weak.status_code == 400
    plain = api.post(
        "/api/auth/register", json={**base, "kdfIterations": 600_000, "protectedVaultKey": "raw-key"}
    )
    assert plain.status_code == 400
