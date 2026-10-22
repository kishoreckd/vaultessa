"""Describe the same response envelopes used by the JSON serializer."""

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi


def install_openapi(app: FastAPI) -> None:
    def schema():
        if app.openapi_schema:
            return app.openapi_schema
        result = get_openapi(title=app.title, version=app.version, routes=app.routes)
        error_schema = {
            "type": "object",
            "required": ["status", "message", "data"],
            "properties": {
                "status": {"type": "string", "enum": ["error"]},
                "message": {"type": "string"},
                "data": {
                    "type": "object",
                    "required": ["code"],
                    "properties": {
                        "code": {"type": "string"},
                        "details": {"type": "array", "items": {"type": "object"}},
                    },
                },
            },
        }
        result.setdefault("components", {}).setdefault("schemas", {})["ApiErrorEnvelope"] = error_schema
        for path, methods in result["paths"].items():
            if not path.startswith("/api/"):
                continue
            for method, operation in methods.items():
                if method not in {"get", "post", "put", "patch", "delete", "options", "head"}:
                    continue
                responses = operation["responses"]
                for status, response in responses.items():
                    if status == "204":
                        response.pop("content", None)
                    elif status.startswith("2"):
                        content = response.get("content", {}).get("application/json")
                        if content is not None:
                            original = content.get("schema", {})
                            content["schema"] = {
                                "type": "object",
                                "required": ["status", "message", "data"],
                                "properties": {
                                    "status": {"type": "string", "enum": ["success"]},
                                    "message": {"type": "string"},
                                    "data": original,
                                },
                            }
                # Request validation is deliberately 400 in this application.
                responses.pop("422", None)
                for status in ("400", "401", "403", "404", "409", "429", "500"):
                    responses[status] = {
                        "description": "API error",
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/ApiErrorEnvelope"},
                            }
                        },
                    }
        app.openapi_schema = result
        return result

    app.openapi = schema
