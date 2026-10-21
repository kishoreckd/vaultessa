import threading
import time
from collections import deque

from fastapi import Request

from ..config import get_settings
from .errors import AppError


class RateLimiter:
    """Sliding-window limiter per client IP, usable as a FastAPI dependency.

    In-memory and per-process: fine for one instance. TODO(P1): move to Redis for multi-instance deployments.
    """

    def __init__(self, max_requests: int, window_seconds: int, scope: str):
        self.max_requests = max_requests
        self.window = window_seconds
        self.scope = scope
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def __call__(self, request: Request) -> None:
        if not get_settings().rate_limit_enabled:
            return
        key = request.client.host if request.client else "unknown"
        now = time.monotonic()
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= now - self.window:
                hits.popleft()
            if len(hits) >= self.max_requests:
                raise AppError.rate_limited()
            hits.append(now)


global_limit = RateLimiter(300, 60, "global")
auth_limit = RateLimiter(10, 60, "auth")
refresh_limit = RateLimiter(30, 60, "refresh")
lookup_limit = RateLimiter(30, 60, "lookup")
