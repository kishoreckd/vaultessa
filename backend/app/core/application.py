import asyncio
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.account import router as account_router
from app.api.audit import router as audit_router
from app.api.auth import router as auth_router
from app.api.external_shares import public_router as public_shares_router
from app.api.external_shares import router as external_shares_router
from app.api.folders import router as folders_router
from app.api.health import router as health_router
from app.api.organizations import router as organizations_router
from app.api.recovery import public_router as recovery_public_router
from app.api.recovery import router as recovery_router
from app.api.secrets import router as secrets_router
from app.api.sharing import router as sharing_router
from app.api.tokens import machine_router
from app.api.tokens import router as tokens_router
from app.constants.http import API_PREFIX, DOCS_PATHS
from app.core.config import get_settings
from app.core.docs import install_docs
from app.core.errors import register_error_handlers
from app.core.openapi import install_openapi
from app.core.rate_limit import global_limit
from app.utils.validation.json_validator import ApiJSONResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services import email_outbox_service
    from app.services.email_jobs import run_loop

    stop = asyncio.Event()
    tasks = []
    if get_settings().email_outbox_worker_enabled:  # first pass resends anything pending after a restart
        tasks.append(asyncio.create_task(email_outbox_service.run_loop(stop)))
    if get_settings().expiry_reminders_enabled:
        tasks.append(asyncio.create_task(run_loop(stop)))
    try:
        yield
    finally:
        stop.set()
        await asyncio.gather(*tasks)


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        default_response_class=ApiJSONResponse,
        lifespan=lifespan,
        version=settings.app_version,
        docs_url=None,
        openapi_url=None,
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
        organizations_router,
        auth_router,
        account_router,
        recovery_router,
        recovery_public_router,
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

    install_openapi(app)
    install_docs(app, settings)
    return app
