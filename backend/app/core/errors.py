import logging

from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.utils.validation.json_validator import JsonResponse

logger = logging.getLogger("vaultessa")

CODE_FOR_STATUS = {
    400: "VALIDATION_ERROR",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "NOT_FOUND",
    409: "CONFLICT",
    413: "VALIDATION_ERROR",
    415: "VALIDATION_ERROR",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
}


class AppError(Exception):
    """Expected, user-facing errors. Anything else becomes a 500."""

    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message

    @classmethod
    def bad_request(cls, message: str) -> "AppError":
        return cls(400, "VALIDATION_ERROR", message)

    @classmethod
    def unauthorized(cls, message: str = "Authentication required") -> "AppError":
        return cls(401, "UNAUTHORIZED", message)

    @classmethod
    def forbidden(cls, message: str = "You do not have permission to do this") -> "AppError":
        return cls(403, "FORBIDDEN", message)

    @classmethod
    def not_found(cls, message: str = "Not found") -> "AppError":
        return cls(404, "NOT_FOUND", message)

    @classmethod
    def conflict(cls, message: str) -> "AppError":
        return cls(409, "CONFLICT", message)

    @classmethod
    def rate_limited(cls) -> "AppError":
        return cls(429, "RATE_LIMITED", "Too many requests. Please slow down.")


def error_response(exc: AppError, background: BackgroundTasks | None = None) -> JSONResponse:
    """Error response that still runs background tasks (e.g. a security email).

    Raising an exception would skip them, so endpoints that must notify on failure return this instead.
    """
    return JsonResponse.create(
        **error_body(exc.code, exc.message), status_code=exc.status_code, background=background
    )


def error_body(code: str, message: str, details: list | None = None) -> dict:
    error: dict = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return JsonResponse.body(
        "error", message, {key: value for key, value in error.items() if key != "message"}
    )


def _validation_details(errors: list) -> list[dict]:
    # Drop the location prefix ("body", "query", ...) and never echo the submitted input back.
    return [
        {"path": ".".join(str(p) for p in err.get("loc", ())[1:]), "message": err.get("msg", "Invalid value")}
        for err in errors
    ]


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JsonResponse.create(**error_body(exc.code, exc.message), status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def handle_request_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = _validation_details(list(exc.errors()))
        return JsonResponse.create(
            **error_body("VALIDATION_ERROR", "Invalid request", details), status_code=400
        )

    @app.exception_handler(ValidationError)
    async def handle_validation(_: Request, exc: ValidationError) -> JSONResponse:
        details = [{"path": ".".join(str(p) for p in e["loc"]), "message": e["msg"]} for e in exc.errors()]
        return JsonResponse.create(
            **error_body("VALIDATION_ERROR", "Invalid request", details), status_code=400
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = CODE_FOR_STATUS.get(exc.status_code, "INTERNAL")
        message = "Route not found" if exc.status_code in (404, 405) else str(exc.detail)
        return JsonResponse.create(
            **error_body(code, message), status_code=exc.status_code, headers=exc.headers
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error on %s %s", request.method, request.url.path)
        return JsonResponse.create(**error_body("INTERNAL", "Something went wrong"), status_code=500)
