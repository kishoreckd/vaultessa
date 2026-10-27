from functools import lru_cache
from ipaddress import ip_address
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "Vaultessa API"
    app_version: str = "0.1.0"
    environment: Literal["development", "test", "production"] = "development"
    # Explicitly enable password-protected docs, including in production.
    swagger_session_ttl_minutes: int = Field(default=60, ge=5, le=480)
    enable_api_docs: bool = False
    swagger_username: str | None = None
    swagger_password: str | None = Field(default=None, repr=False)
    database_url: str = Field(min_length=1)

    # No defaults on purpose: the app fails closed if secrets are missing.
    jwt_access_secret: str = Field(min_length=32)
    prelogin_secret: str = Field(min_length=32)
    # Encrypts server-side auth secrets at rest (TOTP seeds). Not related to vault data.
    mfa_encryption_key: str = Field(min_length=32)

    # Security policy. Stored scrypt hashes retain their original work factors.
    scrypt_n: int = Field(default=2**15, ge=2**15, le=2**20)
    scrypt_r: int = Field(default=8, ge=8, le=32)
    scrypt_p: int = Field(default=1, ge=1, le=16)
    scrypt_dklen: int = Field(default=32, ge=32, le=64)
    scrypt_maxmem: int = Field(default=64 * 1024 * 1024, ge=64 * 1024 * 1024, le=1024**3)
    jwt_algorithm: Literal["HS256"] = "HS256"
    mfa_token_ttl_minutes: int = Field(default=5, gt=0, le=15)
    max_failed_logins: int = Field(default=5, ge=1, le=20)
    account_lock_minutes: int = Field(default=15, gt=0)
    verification_ttl_hours: int = Field(default=24, gt=0)
    password_reset_ttl_minutes: int = Field(default=15, gt=0, le=60)
    email_resend_cooldown_seconds: int = Field(default=45, gt=0)
    email_code_ttl_minutes: int = Field(default=10, ge=1, le=30)
    email_code_max_attempts: int = Field(default=5, ge=1, le=10)
    # After max wrong codes, block entering and requesting codes for this long.
    email_code_lockout_minutes: int = Field(default=120, ge=1, le=1440)
    max_password_reset_attempts: int = Field(default=5, ge=1, le=20)
    external_share_max_lifetime_days: int = Field(default=90, gt=0)
    external_share_max_code_attempts: int = Field(default=5, ge=1, le=20)
    api_token_max_lifetime_days: int = Field(default=730, gt=0)
    # Existing authenticator secrets don't store a separate period/digit policy.
    totp_period_seconds: Literal[30] = 30
    totp_digits: Literal[6] = 6
    totp_issuer: str = "Vaultessa"
    recovery_code_count: int = Field(default=10, ge=1, le=50)
    # The "recovery code used" email also asks to replace codes once this many (or fewer) are left.
    recovery_codes_low_threshold: int = Field(default=5, ge=0, le=50)
    refresh_cookie_name: str = Field(default="pv_refresh", pattern=r"^[A-Za-z0-9_-]+$")

    rate_limit_window_seconds: int = Field(default=60, gt=0)
    rate_limit_global_requests: int = Field(default=300, gt=0)
    rate_limit_auth_requests: int = Field(default=10, gt=0)
    rate_limit_refresh_requests: int = Field(default=30, gt=0)
    rate_limit_lookup_requests: int = Field(default=30, gt=0)
    rate_limit_public_share_requests: int = Field(default=60, gt=0)
    rate_limit_machine_requests: int = Field(default=120, gt=0)

    access_token_ttl_minutes: int = Field(default=15, gt=0)
    refresh_token_ttl_days: int = Field(default=30, gt=0)
    default_kdf_iterations: int = Field(default=600_000, ge=100_000)
    cors_origins: Annotated[list[str], NoDecode]
    rate_limit_enabled: bool = True

    # Outgoing email (optional). Dev uses Mailpit from docker-compose: SMTP 1026, inbox UI on :8026.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_starttls: bool = False
    smtp_timeout_seconds: int = Field(default=10, gt=0, le=120)
    # Optional diagnostic configuration must not prevent the entire API from starting.
    email_test_api_key: str | None = Field(default=None, repr=False)
    mailpit_base_url: str | None = None  # Optional local SMTP acceptance test inbox.
    smtp_from: str | None = None
    # Durable email outbox: every email is recorded, retried with backoff after SMTP/server failures.
    email_outbox_worker_enabled: bool = True
    email_outbox_poll_seconds: int = Field(default=60, ge=10, le=3600)
    email_outbox_max_attempts: int = Field(default=8, ge=1, le=20)
    email_outbox_default_ttl_hours: int = Field(default=24, ge=1, le=168)
    email_outbox_retention_days: int = Field(default=30, ge=1, le=365)
    expiry_reminders_enabled: bool = True
    expiry_reminder_poll_seconds: int = Field(default=300, ge=30, le=86400)
    expiry_reminder_batch_size: int = Field(default=20, ge=1, le=100)
    organization_invitation_ttl_days: int = Field(default=7, ge=1, le=30)
    organization_invitation_cooldown_seconds: int = Field(default=60, ge=1)
    organization_max_members: int = Field(default=500, ge=2, le=10000)
    organization_domain_verification_days: int = Field(default=30, ge=1, le=90)
    organization_dns_resolver_url: str = "https://dns.google/resolve"
    organization_dns_timeout_seconds: int = Field(default=5, ge=1, le=15)
    # Public origin(s) of the web app; links in emails must start with one of these.
    app_base_url: str

    enquiry_rate_limit_requests: int = Field(default=3, ge=1, le=100)
    enquiry_rate_limit_window_seconds: int = Field(default=3600, ge=60, le=86400)

    @field_validator("totp_period_seconds", "totp_digits", mode="before")
    @classmethod
    def parse_authenticator_format(cls, value: object) -> object:
        return int(value) if isinstance(value, str) else value

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

    @model_validator(mode="after")
    def validate_deployment_urls(self) -> "Settings":
        if self.enable_api_docs:
            if (
                not self.swagger_username
                or not self.swagger_username.strip()
                or not self.swagger_username.isascii()
                or ":" in self.swagger_username
            ):
                raise ValueError("SWAGGER_USERNAME must be non-empty ASCII without a colon")
            if (
                not self.swagger_password
                or not self.swagger_password.strip()
                or not self.swagger_password.isascii()
                or not 16 <= len(self.swagger_password) <= 1024
            ):
                raise ValueError(
                    "SWAGGER_PASSWORD must contain 16 to 1024 ASCII characters when API docs are enabled"
                )
        if self.scrypt_n & (self.scrypt_n - 1):
            raise ValueError("SCRYPT_N must be a power of two")
        if self.scrypt_maxmem <= 128 * self.scrypt_n * self.scrypt_r + 256 * self.scrypt_r * self.scrypt_p:
            raise ValueError("SCRYPT_MAXMEM must cover the configured scrypt work factors and overhead")
        for value in [self.app_base_url, *self.cors_origins]:
            parsed = urlsplit(value)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or parsed.username
                or parsed.password
                or parsed.query
                or parsed.fragment
                or parsed.path not in {"", "/"}
            ):
                raise ValueError(
                    "APP_BASE_URL and CORS_ORIGINS must be HTTP(S) origins without paths or credentials"
                )
            if self.is_production and (
                parsed.scheme != "https"
                or parsed.hostname.lower().rstrip(".") == "localhost"
                or parsed.hostname.lower().rstrip(".").endswith((".localhost", ".local"))
            ):
                raise ValueError("Production app URLs must use HTTPS and a non-local hostname")
            if self.is_production:
                try:
                    address = ip_address(parsed.hostname)
                except ValueError:
                    address = None
                if address and (address.is_loopback or address.is_unspecified):
                    raise ValueError("Production app URLs cannot use loopback or unspecified addresses")
        if not self.cors_origins:
            raise ValueError("CORS_ORIGINS must contain at least one origin")
        resolver = urlsplit(self.organization_dns_resolver_url)
        if (
            resolver.scheme != "https"
            or not resolver.hostname
            or resolver.username
            or resolver.password
            or resolver.query
            or resolver.fragment
        ):
            raise ValueError(
                "ORGANIZATION_DNS_RESOLVER_URL must be a trusted HTTPS endpoint without credentials or query"
            )
        if self.smtp_host and not self.smtp_from:
            raise ValueError("SMTP_FROM is required when SMTP_HOST is configured")
        self.app_base_url = self.app_base_url.rstrip("/")
        return self

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # values come from the environment
