import threading
import time
from collections import deque

from fastapi import Request

from app.core.config import get_settings
from app.core.errors import AppError


class RateLimiter:
    """Sliding-window limiter per client IP, usable as a FastAPI dependency.

    In-memory and per-process: fine for one instance. TODO(P1): move to Redis for multi-instance deployments.
    """

    def __init__(self, requests_setting: str, scope: str):
        self.requests_setting = requests_setting
        self.scope = scope
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def __call__(self, request: Request) -> None:
        settings = get_settings()
        if not settings.rate_limit_enabled:
            return
        key = request.client.host if request.client else "unknown"
        now = time.monotonic()
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= now - settings.rate_limit_window_seconds:
                hits.popleft()
            if len(hits) >= getattr(settings, self.requests_setting):
                raise AppError.rate_limited()
            hits.append(now)


global_limit = RateLimiter("rate_limit_global_requests", "global")
auth_limit = RateLimiter("rate_limit_auth_requests", "auth")
refresh_limit = RateLimiter("rate_limit_refresh_requests", "refresh")
lookup_limit = RateLimiter("rate_limit_lookup_requests", "lookup")
