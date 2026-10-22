from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.deps import DbSession
from app.utils.validation.json_validator import JsonResponse

router = APIRouter(tags=["operations"])


@router.get("/health")
def health(db: DbSession):
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return JsonResponse.error(
            "Database unavailable",
            {"code": "SERVICE_UNAVAILABLE", "status": "degraded", "db": "unreachable"},
            status_code=503,
        )
    return {"status": "ok", "db": "ok"}
