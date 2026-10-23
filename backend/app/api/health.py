from time import perf_counter

from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.core.deps import DbSession
from app.services.email_config import email_enabled
from app.services.health_service import database_readiness
from app.utils.validation.json_validator import JsonResponse

router = APIRouter(tags=["operations"])


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
