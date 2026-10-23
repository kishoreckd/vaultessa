"""Backend documentation login, independent of vault authentication."""

import hashlib
import secrets
import time
from pathlib import Path
from typing import Annotated

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel, Field

from app.constants.http import DOCS_PATHS
from app.core.config import Settings
from app.core.rate_limit import auth_limit


class DocsLogin(BaseModel):
    username: str = Field(max_length=1024)
    password: str = Field(max_length=1024)


def install_docs(app: FastAPI, settings: Settings) -> None:
    protected = settings.enable_api_docs
    if not protected and settings.is_production:
        return
    security = HTTPBasic(auto_error=False)
    cookie_name = "vaultessa_docs"
    signing_key = hashlib.sha256(
        (
            settings.jwt_access_secret
            + ":docs:"
            + (settings.swagger_username or "")
            + ":"
            + (settings.swagger_password or "")
        ).encode()
    ).digest()

    def valid_credentials(username: str, password: str) -> bool:
        def digest(value: str) -> bytes:
            return hashlib.sha256(value.encode()).digest()

        return secrets.compare_digest(
            digest(username), digest(settings.swagger_username or "")
        ) & secrets.compare_digest(digest(password), digest(settings.swagger_password or ""))

    def authenticated(request: Request) -> bool:
        try:
            jwt.decode(
                request.cookies.get(cookie_name, ""),
                signing_key,
                algorithms=["HS256"],
                audience="vaultessa-docs",
                options={"require": ["exp", "aud"]},
            )
            return True
        except jwt.InvalidTokenError:
            return False

    def verify_credentials(
        request: Request, credentials: Annotated[HTTPBasicCredentials | None, Depends(security)]
    ):
        if not authenticated(request) and not (
            credentials and valid_credentials(credentials.username, credentials.password)
        ):
            raise HTTPException(401, "Documentation authentication required")

    dependencies = [Depends(auth_limit), Depends(verify_credentials)] if protected else []

    @app.get(DOCS_PATHS[0], include_in_schema=False)
    def swagger(request: Request):
        if protected and not authenticated(request):
            return HTMLResponse(
                Path(__file__)
                .resolve()
                .parents[1]
                .joinpath("utils/templates/docs/login.html")
                .read_text(encoding="utf-8")
            )
        response = get_swagger_ui_html(openapi_url=DOCS_PATHS[1], title=f"{settings.app_name} - Swagger UI")
        if protected:
            response.body = response.body.replace(
                b"<body>",
                b"""<body><button style="position:fixed;right:24px;
bottom:24px;z-index:1000;padding:12px 20px;
border:0;border-radius:10px;background:#4f46e5;color:white;cursor:pointer"
onclick="fetch('/api/docs/logout',{method:'POST',
headers:{'Content-Type':'application/json'}}).then(()=>location.reload())">Sign out of docs</button>""",
            )
            response.headers["content-length"] = str(len(response.body))
        return response

    if protected:

        def same_origin(request: Request):
            if request.headers.get("origin") != str(request.base_url).rstrip("/"):
                raise HTTPException(403, "Same-origin request required")

        @app.post(
            "/api/docs/login",
            include_in_schema=False,
            dependencies=[Depends(auth_limit), Depends(same_origin)],
        )
        def login(body: DocsLogin):
            if not valid_credentials(body.username, body.password):
                raise HTTPException(401, "Incorrect username or password")
            ttl = settings.swagger_session_ttl_minutes * 60
            token = jwt.encode(
                {"aud": "vaultessa-docs", "exp": int(time.time()) + ttl}, signing_key, algorithm="HS256"
            )
            response = JSONResponse({"status": "success", "message": "Signed in", "data": None})
            response.set_cookie(
                cookie_name,
                token,
                max_age=ttl,
                path="/api",
                httponly=True,
                secure=settings.is_production,
                samesite="strict",
            )
            return response

        @app.post("/api/docs/logout", include_in_schema=False, dependencies=[Depends(same_origin)])
        def logout():
            response = JSONResponse({"status": "success", "message": "Signed out", "data": None})
            response.delete_cookie(
                cookie_name, path="/api", httponly=True, secure=settings.is_production, samesite="strict"
            )
            return response

    @app.get(DOCS_PATHS[1], include_in_schema=False, dependencies=dependencies)
    def openapi():
        return JSONResponse(app.openapi())
