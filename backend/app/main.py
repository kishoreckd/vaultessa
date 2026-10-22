"""ASGI entry point; application setup lives in core/application.py."""

from app.core.application import create_app

app = create_app()
