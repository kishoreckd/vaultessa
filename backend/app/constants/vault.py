"""Vault item types, key wrapping and access permissions."""

import enum


class Kdf(enum.StrEnum):
    PBKDF2_SHA256 = "PBKDF2_SHA256"


class SecretType(enum.StrEnum):
    LOGIN = "LOGIN"
    SECURE_NOTE = "SECURE_NOTE"
    CARD = "CARD"
    IDENTITY = "IDENTITY"
    BANK_ACCOUNT = "BANK_ACCOUNT"
    SSH_KEY = "SSH_KEY"
    API_KEY = "API_KEY"
    WIFI = "WIFI"
    SERVER = "SERVER"


class Permission(enum.StrEnum):
    """Ordered: LOGIN_ONLY < VIEW < MODIFY < MANAGE."""

    LOGIN_ONLY = "LOGIN_ONLY"
    VIEW = "VIEW"
    MODIFY = "MODIFY"
    MANAGE = "MANAGE"


class KeyWrap(enum.StrEnum):
    VAULT = "VAULT"  # AES-GCM under the user's vault key
    RSA = "RSA"  # RSA-OAEP under the user's public key (share not yet accepted)


PERMISSION_RANK = {Permission.LOGIN_ONLY: 0, Permission.VIEW: 1, Permission.MODIFY: 2, Permission.MANAGE: 3}
