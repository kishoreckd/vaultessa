from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints
from pydantic.alias_generators import to_camel

_B64 = r"[A-Za-z0-9+/]+={0,2}"
_ENC_STRING = rf"^v1\.{_B64}\.{_B64}$"


class ApiModel(BaseModel):
    """Responses: snake_case in Python, camelCase on the wire."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class RequestModel(ApiModel):
    """Request bodies: camelCase only, unknown fields rejected (e.g. a stray plaintext 'masterPassword')."""

    model_config = ConfigDict(extra="forbid", populate_by_name=False)


def enc_string(max_length: int = 1_000_000):
    """Client-side ciphertext: v1.<base64 iv>.<base64 ciphertext+tag>"""
    return Annotated[str, StringConstraints(max_length=max_length, pattern=_ENC_STRING)]


def base64_str(max_length: int):
    return Annotated[str, StringConstraints(max_length=max_length, pattern=rf"^{_B64}$")]


EncString = enc_string()
EncKey = enc_string(1_000)  # a key wrapped with a symmetric key
EncName = enc_string(10_000)  # short encrypted labels (folder names)
RsaWrappedKey = base64_str(2_048)  # a key wrapped with RSA-OAEP-3072
Base64Hash = base64_str(128)
Base64Salt = base64_str(64)
PublicKey = base64_str(2_048)

Email = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, to_lower=True, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    ),
]
