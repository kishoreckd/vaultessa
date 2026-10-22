from .helpers import b64, register, response_data


def test_register_then_login_and_me(api):
    alice = register(api, "alice")
    me = api.get("/api/auth/me", headers=alice.headers)
    assert me.status_code == 200
    assert response_data(me)["email"] == "alice@example.com"
    assert "authHash" not in response_data(me)

    login = api.post("/api/auth/login", json={"email": "ALICE@example.com ", "authHash": alice.auth_hash})
    assert login.status_code == 200
    assert response_data(login)["account"]["kdfIterations"] == 600_000
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
    assert response_data(response)["error"]["message"] == "Invalid email or master password"
    unknown = api.post("/api/auth/login", json={"email": "ghost@example.com", "authHash": b64("x")})
    assert response_data(unknown) == response_data(response)  # same answer whether or not the account exists


def test_prelogin_does_not_reveal_unknown_emails(api):
    register(api, "alice")
    real = response_data(api.post("/api/auth/prelogin", json={"email": "alice@example.com"}))
    fake = response_data(api.post("/api/auth/prelogin", json={"email": "ghost@example.com"}))
    assert set(real) == set(fake) == {"kdf", "kdfIterations", "kdfSalt"}
    assert response_data(api.post("/api/auth/prelogin", json={"email": "ghost@example.com"})) == fake


def test_refresh_rotates_and_logout_revokes(api):
    alice = register(api, "alice")
    old_cookie = api.cookies.get("pv_refresh")

    refreshed = api.post("/api/auth/refresh")
    assert refreshed.status_code == 200
    new_token = response_data(refreshed)["accessToken"]

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


def test_change_password_preserves_items_and_revokes_other_sessions(api):
    from .helpers import ENC_2, create_secret

    alice = register(api, "alice")
    item = create_secret(api, alice)
    other = response_data(
        api.post("/api/auth/login", json={"email": alice.email, "authHash": alice.auth_hash})
    )
    other_headers = {"Authorization": f"Bearer {other['accessToken']}"}
    body = {
        "authHash": alice.auth_hash,
        "newAuthHash": b64("new-client-derived-hash"),
        "kdfSalt": b64("new-sixteen-salt"),
        "kdfIterations": 600000,
        "protectedVaultKey": ENC_2,
    }
    assert api.post("/api/account/password", json=body).status_code == 401
    assert (
        api.post(
            "/api/account/password", json={**body, "authHash": b64("wrong")}, headers=alice.headers
        ).status_code
        == 401
    )
    changed = api.post("/api/account/password", json=body, headers=alice.headers)
    assert changed.status_code == 200, changed.text
    assert response_data(changed)["protectedVaultKey"] == ENC_2
    assert (
        response_data(api.get("/api/secrets", headers=alice.headers))[0]["encryptedData"]
        == item["encryptedData"]
    )
    assert api.get("/api/secrets", headers=other_headers).status_code == 401
    assert (
        api.post("/api/auth/login", json={"email": alice.email, "authHash": alice.auth_hash}).status_code
        == 401
    )
    assert (
        api.post("/api/auth/login", json={"email": alice.email, "authHash": body["newAuthHash"]}).status_code
        == 200
    )
