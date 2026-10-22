r"""Generate a local illustrated HTML gallery. --text also writes optional fallback samples."""

import argparse
import sys
from datetime import UTC, datetime, timedelta
from html import escape
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import BackgroundTasks  # noqa: E402

from app.constants.email import EMAIL_ASSETS
from app.core.config import get_settings
from app.services import email_templates as templates
from app.services import notifications_service as notify


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--text", action="store_true", help="Also generate optional plain-text samples in plaintext/"
    )
    args = parser.parse_args()
    output = Path(__file__).resolve().parents[1] / "app/email_previews"
    output.mkdir(exist_ok=True)
    user = SimpleNamespace(name="Priya", email="priya@example.com", notification_prefs={})
    actor = SimpleNamespace(name="Arjun", email="arjun@example.com")
    share = SimpleNamespace(
        owner=actor, expires_at=datetime.now(UTC) + timedelta(days=1), max_views=1, code_hash="preview-only"
    )
    base_url = get_settings().app_base_url
    examples = {"share-invitation": templates.share_invitation(share, base_url + "/s/preview#demo-key")}
    content = {
        "verify-email": templates.verification_email("Priya", base_url + "/verify-email#token=preview-only"),
        "welcome": templates.welcome_email("Priya", base_url),
        "forgot-password": templates.forgot_password_email("Priya", base_url + "/recover#token=preview-only"),
        "recovery-completed": templates.recovery_completed_email("Priya", base_url),
        "recovery-enabled": templates.recovery_key_email(True, base_url),
        "recovery-disabled": templates.recovery_key_email(False, base_url),
        "expiry-reminder": templates.expiry_reminder(
            datetime.now(UTC) + timedelta(days=7), "7_days", base_url + "/?item=preview"
        ),
        "item-expired": templates.expiry_reminder(
            datetime.now(UTC) - timedelta(days=1), "expired", base_url + "/?item=preview"
        ),
    }
    examples.update({name: templates.render(value) for name, value in content.items()})
    notify.email_enabled = lambda: True

    def capture(name, function, *values):
        background = BackgroundTasks()
        function(background, user, *values)
        examples[name] = background.tasks[0].args[1:]

    capture("new-device", notify.new_sign_in, "192.0.2.1", "Windows Chrome/130.0")
    capture("account-locked", notify.account_locked, get_settings().account_lock_minutes)
    capture("mfa-enabled", notify.two_step_changed, "totp", True)
    capture("mfa-disabled", notify.two_step_changed, "totp", False)
    capture("password-changed", notify.master_password_changed)
    capture("token-created", notify.token_created, "Build pipeline", 3)
    capture("item-shared", notify.item_shared, actor, "VIEW")
    capture("access-changed", notify.access_changed, actor, "MODIFY")
    capture("link-opened", notify.link_opened, "guest@example.com", False)
    capture("link-locked", notify.link_locked, "guest@example.com")
    for name, (subject, text, html) in examples.items():
        for cid, path in EMAIL_ASSETS.items():
            html = html.replace("cid:" + cid, "../static/email/" + path.name)
        (output / f"{name}.html").write_text(html, encoding="utf-8")
        # Remove only this generator's legacy flat text samples. Plain text still ships inside emails.
        legacy = output / f"{name}.txt"
        if legacy.exists():
            legacy.unlink()
        if args.text:
            (output / "plaintext").mkdir(exist_ok=True)
            (output / "plaintext" / f"{name}.txt").write_text(
                f"Subject: {subject}\n\n{text}", encoding="utf-8"
            )
    links = "".join(
        f'<a href="{name}.html" target="email-preview">{escape(name.replace("-", " ").title())}</a>'
        for name in examples
    )
    index = templates.render_preview_gallery(links)
    (output / "index.html").write_text(index, encoding="utf-8")
    print(f"Generated {len(examples)} illustrated HTML previews and index.html")


if __name__ == "__main__":
    main()
