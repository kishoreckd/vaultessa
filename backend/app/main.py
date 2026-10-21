from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .core.errors import register_error_handlers
from .core.rate_limit import global_limit
from .modules.account.router import router as account_router
from .modules.audit.router import router as audit_router
from .modules.auth.router import router as auth_router
from .modules.external_shares.router import public_router as public_shares_router
from .modules.external_shares.router import router as external_shares_router
from .modules.folders.router import router as folders_router
from .modules.health.router import router as health_router
from .modules.secrets.router import router as secrets_router
from .modules.sharing.router import router as sharing_router
from .modules.tokens.router import machine_router
from .modules.tokens.router import router as tokens_router

API_PREFIX = "/api"
DOCS_PATHS = ("/api/docs", "/api/openapi.json")


def create_app() -> FastAPI:
    settings = get_settings()
    docs_enabled = not settings.is_production

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        docs_url="/api/docs" if docs_enabled else None,
        openapi_url="/api/openapi.json" if docs_enabled else None,
        redoc_url=None,
        dependencies=[Depends(global_limit)],
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Cache-Control", "no-store")
        if not request.url.path.startswith(DOCS_PATHS):
            response.headers.setdefault(
                "Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"
            )
        if settings.is_production:
            response.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
        return response

    register_error_handlers(app)

    for router in (
        health_router,
        auth_router,
        account_router,
        folders_router,
        secrets_router,
        sharing_router,
        external_shares_router,
        public_shares_router,
        tokens_router,
        machine_router,
        audit_router,
    ):
        app.include_router(router, prefix=API_PREFIX)

    return app


app = create_app()
