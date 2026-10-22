"""Shared wire format for all JSON API responses (204 has no body)."""

from typing import Any, Literal

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.background import BackgroundTask


class JsonResponse:
    @staticmethod
    def body(status: Literal["success", "error"], message: str, data: Any = None) -> dict:
        return {"status": status, "message": message, "data": data}

    @classmethod
    def create(
        cls,
        status: Literal["success", "error"],
        message: str,
        data: Any,
        status_code: int,
        headers=None,
        background: BackgroundTask | None = None,
    ) -> JSONResponse:
        return JSONResponse(
            content=jsonable_encoder(cls.body(status, message, data)),
            status_code=status_code,
            headers=headers,
            background=background,
        )

    @classmethod
    def success(
        cls, message: str, data=None, status_code: int = 200, headers=None, background=None
    ) -> JSONResponse:
        return cls.create("success", message, data, status_code, headers, background)

    @classmethod
    def error(
        cls, message: str, data=None, status_code: int = 400, headers=None, background=None
    ) -> JSONResponse:
        return cls.create("error", message, data, status_code, headers, background)

    @classmethod
    def validation_error(cls, ve: ValidationError, status_code: int = 422, headers=None) -> JSONResponse:
        # Never expose submitted values or validator context (passwords, codes, proofs).
        errors = [
            {
                "path": ".".join(str(part) for part in err["loc"]),
                "message": err["msg"],
                "errorType": err["type"],
            }
            for err in ve.errors()
        ]
        return cls.error(
            "Validation error", {"code": "VALIDATION_ERROR", "details": errors}, status_code, headers
        )


class ApiJSONResponse(JSONResponse):
    """FastAPI validates/filters the original DTO before this shared serializer runs."""

    def render(self, content: Any) -> bytes:
        message = "Success"
        data = content
        if isinstance(content, dict) and isinstance(content.get("message"), str):
            message = content["message"]
            data = {key: value for key, value in content.items() if key != "message"} or None
        return super().render(JsonResponse.body("success", message, data))
