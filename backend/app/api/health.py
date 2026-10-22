from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.deps import DbSession

router = APIRouter(tags=["operations"])


@router.get("/health")
def health(db: DbSession):
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return JSONResponse({"status": "degraded", "db": "unreachable"}, status_code=503)
    return {"status": "ok", "db": "ok"}
