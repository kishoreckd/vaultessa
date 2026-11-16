from app.constants.vault import SecretType


def test_json_is_a_supported_secret_type() -> None:
    assert SecretType.JSON.value == "JSON"
    assert SecretType("JSON") is SecretType.JSON
