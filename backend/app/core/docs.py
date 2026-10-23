"""Swagger access is independent of vault user/session authentication."""

import hashlib
import secrets
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from app.constants.http import DOCS_PATHS
from app.core.config import Settings
from app.core.rate_limit import auth_limit


def install_docs(app: FastAPI, settings: Settings) -> None:
    protected = settings.enable_api_docs
    if not protected and settings.is_production:
        return
    security = HTTPBasic(auto_error=False, realm="Vaultessa API documentation")

    def verify_credentials(credentials: Annotated[HTTPBasicCredentials | None, Depends(security)]):
        def digest(value: str) -> bytes:
            return hashlib.sha256(value.encode("utf-8")).digest()

        username_valid = secrets.compare_digest(
            digest(credentials.username if credentials else ""), digest(settings.swagger_username or "")
        )
        password_valid = secrets.compare_digest(
            digest(credentials.password if credentials else ""), digest(settings.swagger_password or "")
        )
        if credentials is None or not (username_valid & password_valid):
            raise HTTPException(
                401,
                "Documentation authentication required",
                headers={
                    "WWW-Authenticate": 'Basic realm="Vaultessa API documentation"',
                },
            )

    dependencies = [Depends(auth_limit), Depends(verify_credentials)] if protected else []

    @app.get(DOCS_PATHS[0], include_in_schema=False, dependencies=dependencies)
    def swagger():
        return get_swagger_ui_html(openapi_url=DOCS_PATHS[1], title=f"{settings.app_name} - Swagger UI")

    @app.get(DOCS_PATHS[1], include_in_schema=False, dependencies=dependencies)
    def openapi():
        # OpenAPI is a standard document, not an application response envelope.
        return JSONResponse(app.openapi())
