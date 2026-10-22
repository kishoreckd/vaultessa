"""Send fictional preview messages only to loopback SMTP and verify their Mailpit contents."""

import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import preview_emails  # noqa: E402

from app.core.config import get_settings
from app.services import email_templates, notifications_service
from app.services.email_service import send_email


def main():
    settings = get_settings()
    inbox = urlsplit(settings.mailpit_base_url or "")
    loopback = {"localhost", "127.0.0.1", "::1"}
    if (
        settings.environment != "development"
        or settings.smtp_host not in loopback
        or inbox.hostname not in loopback
    ):
        raise SystemExit(
            "Local email checks require development, loopback SMTP and a loopback MAILPIT_BASE_URL"
        )
    if inbox.scheme not in {"http", "https"} or inbox.username or inbox.password:
        raise SystemExit("MAILPIT_BASE_URL must be a local HTTP(S) URL without credentials")
    captures = []
    original = email_templates.render

    def capture(*args, **kwargs):
        result = original(*args, **kwargs)
        captures.append(result)
        return result

    with (
        patch.object(email_templates, "render", capture),
        patch.object(notifications_service, "render", capture),
        patch.object(sys, "argv", ["preview_emails.py"]),
    ):
        preview_emails.main()
    prefix = "Vaultessa QA " + datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    for subject, text, html in captures:
        result = send_email("vaultessa-qa@example.invalid", prefix + " / " + subject, text, html)
        if result.status != "accepted":
            raise SystemExit("A local SMTP submission failed")
    base = settings.mailpit_base_url.rstrip("/")
    with urlopen(base + "/api/v1/messages?limit=100", timeout=10) as response:  # noqa: S310 -- loopback-only URL checked above
        messages = json.load(response)["messages"]
    own = [message for message in messages if message.get("Subject", "").startswith(prefix)]
    if len(own) != len(captures):
        raise SystemExit("Not all local messages appeared in Mailpit")
    for message in own:
        with urlopen(base + "/api/v1/message/" + message["ID"], timeout=10) as response:  # noqa: S310 -- loopback-only Mailpit ID
            received = json.load(response)
        if not received.get("HTML") or not received.get("Text"):
            raise SystemExit("A local message lost its HTML or plain-text alternative")
        if "prefers-color-scheme: dark" not in received["HTML"]:
            raise SystemExit("Dark-mode email styling was not preserved")
        if len(received.get("Inline", [])) < 2:
            raise SystemExit("Inline logo or contextual illustration was not preserved")
    print(
        f"Verified {len(own)} fictional emails in local Mailpit: "
        "SMTP acceptance, multipart text/HTML, dark CSS and CID artwork"
    )


if __name__ == "__main__":
    main()
