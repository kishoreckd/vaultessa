from datetime import UTC, datetime, timedelta
from secrets import compare_digest
from threading import Lock
from time import monotonic, perf_counter

from fastapi import APIRouter, Depends
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.core.deps import DbSession
from app.core.errors import AppError
from app.core.rate_limit import auth_limit
from app.db.models.email_outbox_model import EmailOutbox
from app.services import email_outbox_service
from app.services.email_config import email_enabled
from app.services.email_health import check_email_connection
from app.services.email_service import send_email
from app.services.health_service import database_readiness
from app.utils.validation.json_validator import JsonResponse

router = APIRouter(tags=["operations"])

_email_check_lock = Lock()
_email_check_cached: tuple[float, dict] | None = None
_test_key_header = APIKeyHeader(name="X-Email-Test-Key", auto_error=False)


def require_email_test_key(key: str | None = Depends(_test_key_header)) -> None:
    configured = get_settings().email_test_api_key
    if not configured or len(configured) < 32:
        raise AppError(
            503, "EMAIL_TEST_DISABLED", "Set EMAIL_TEST_API_KEY to a secret of at least 32 characters"
        )
    if not key or not compare_digest(key.encode(), configured.encode()):
        raise AppError.unauthorized("Invalid email test key")


class TestEmailRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    email: str = Field(
        max_length=254,
        pattern=r"^[^\s@<>\x00-\x1f\x7f]+@[^\s@<>\x00-\x1f\x7f]+\.[^\s@<>\x00-\x1f\x7f]+$",
    )
    title: str = Field(default="Email delivery test", min_length=1, max_length=150, pattern=r"^[^\r\n\x00]+$")
    message: str = Field(
        default="If you received this message, the Vaultessa email delivery test reached your mailbox.",
        min_length=1,
        max_length=5000,
    )


@router.post("/health/email", dependencies=[Depends(auth_limit), Depends(require_email_test_key)])
def send_test_email(
    db: DbSession,
    payload: TestEmailRequest,
):
    """Send a labelled test using X-Email-Test-Key; one test per minute across instances."""
    # Serialize diagnostic submissions across serverless instances without a user session.
    db.execute(text("SELECT pg_advisory_xact_lock(746238901)"))
    now = datetime.now(UTC)
    category = "email_diagnostic"
    recent = db.scalar(
        select(EmailOutbox.id)
        .where(
            EmailOutbox.category == category,
            EmailOutbox.created_at > now - timedelta(seconds=60),
        )
        .limit(1)
    )
    if recent is not None:
        raise AppError.rate_limited()
    outbox_id = email_outbox_service.enqueue(
        payload.email,
        f"[Vaultessa test] {payload.title}",
        "This is a requested Vaultessa test email.\n\n" + payload.message,
        None,
        category,
        ttl=timedelta(minutes=5),
    )
    db.commit()
    # Use the durable ledger for throttling and correlation, but return this attempt's result.
    delivery = []

    def sender(*args):
        result = send_email(*args)
        delivery.append(result)
        return result

    email_outbox_service.deliver(outbox_id, sender=sender)
    if not delivery:
        return JsonResponse.error(
            "Test delivery was not attempted", {"code": "EMAIL_TEST_NOT_ATTEMPTED"}, 503
        )
    result = delivery[0]
    data = {
        "submission": result.status,
        "delivery": "not_confirmed",
        "messageId": result.message_id,
        "testId": str(outbox_id),
        "resendAfterSeconds": 60,
    }
    if result.status != "accepted":
        return JsonResponse.error(result.message, data, 503)
    return JsonResponse.success(result.message, data, status_code=202)


@router.get("/health/email")
def email_health():
    """Check SMTP without sending mail. Cached per instance for 60 seconds."""
    global _email_check_cached
    with _email_check_lock:
        if _email_check_cached is None or monotonic() >= _email_check_cached[0]:
            data = check_email_connection()
            _email_check_cached = (monotonic() + 60, data)
        data = dict(_email_check_cached[1], cacheSeconds=60)
    if data["stage"] != "complete":
        return JsonResponse.error("Email connectivity check failed", data, status_code=503)
    return JsonResponse.success(
        "SMTP connection is healthy. Sender authorization and inbox delivery were not tested.", data
    )


@router.get("/health")
def health(db: DbSession):
    settings = get_settings()

    data = {
        "status": "ok",
        "db": "ok",
        "version": settings.app_version,
        "databaseLatencyMs": None,
        "schema": "unknown",
        "migrations": "unknown",
        "email": {
            "configuration": "configured" if email_enabled() else "not_configured",
            "delivery": "not_tested",
        },
    }
    try:
        started = perf_counter()
        db.execute(text("SELECT 1"))
        data["databaseLatencyMs"] = round((perf_counter() - started) * 1000, 2)
    except SQLAlchemyError:
        data.update(code="SERVICE_UNAVAILABLE", status="degraded", db="unreachable")
        return JsonResponse.error(
            "Database unavailable",
            data,
            status_code=503,
        )
    try:
        data.update(database_readiness(db))
    except SQLAlchemyError:
        data.update(schema="check_failed", migrations="unknown")
    if data["schema"] != "ready" or data["migrations"] != "up_to_date":
        data.update(code="SERVICE_UNAVAILABLE", status="degraded")
        return JsonResponse.error("Database schema is not ready", data, status_code=503)
    return JsonResponse.create(
        status="success",
        message="Service is healthy",
        data=data,
        status_code=200,
    )
