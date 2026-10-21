from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Vaultessa API"
    app_version: str = "0.1.0"
    environment: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+psycopg://passvault:passvault@localhost:5433/passvault"

    # No defaults on purpose: the app fails closed if secrets are missing.
    jwt_access_secret: str = Field(min_length=32)
    prelogin_secret: str = Field(min_length=32)
    # Encrypts server-side auth secrets at rest (TOTP seeds). Not related to vault data.
    mfa_encryption_key: str = Field(min_length=32)

    access_token_ttl_minutes: int = Field(default=15, gt=0)
    refresh_token_ttl_days: int = Field(default=30, gt=0)
    default_kdf_iterations: int = Field(default=600_000, ge=100_000)
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    rate_limit_enabled: bool = True

    # Outgoing email (optional). Dev uses Mailpit from docker-compose: SMTP 1026, inbox UI on :8026.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_starttls: bool = False
    smtp_from: str = "Vaultessa <no-reply@vaultessa.local>"
    # Public origin(s) of the web app; links in emails must start with one of these.
    app_base_url: str = "http://127.0.0.1:5173"

    # Firebase project used for SMS one-time codes (two-step verification). Unset = SMS option hidden.
    firebase_project_id: str | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("database_url", mode="before")
    @classmethod
    def select_psycopg_driver(cls, value: object) -> object:
        if isinstance(value, str) and value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        return value

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # values come from the environment
