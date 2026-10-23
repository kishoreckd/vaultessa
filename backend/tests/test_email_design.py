from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import BackgroundTasks

from app.constants.email import DARK_THEME, EMAIL_ASSETS, ILLUSTRATIONS, THEME
from app.services import notifications_service as notify
from app.services.email_templates import EmailContent, render, render_dark_styles


def test_every_email_template_has_explicit_project_artwork():
    directory = Path(__file__).resolve().parents[1] / "app/utils/templates/emails"
    templates = {p.stem for p in directory.glob("*.html")} - {"layout", "preview_gallery"}
    assert templates == set(ILLUSTRATIONS)
    for name in templates:
        content = EmailContent(
            "Subject", "Vault access", ["<script>unsafe</script>"], template=name + ".html"
        )
        _, text, html = render(content)
        assert "cid:vaultessa-" + ILLUSTRATIONS[name] in html
        assert "<script>unsafe</script>" not in html
        assert "&lt;script&gt;" in html
        assert "<script>unsafe</script>" in text
    assert all(path.is_file() for path in EMAIL_ASSETS.values())


def test_new_email_context_requires_an_illustration_mapping():
    with pytest.raises(KeyError):
        render(EmailContent("Subject", "Heading", [], template="unmapped.html"))


def test_all_email_contexts_include_automatic_dark_mode_without_changing_content():
    for name in ILLUSTRATIONS:
        content = EmailContent(
            "Subject",
            "Heading",
            ["Dynamic content"],
            button=("Review item", "https://vault.company.example/?item=123"),
            details=[("Recipient", "mira@company.example")],
            template=name + ".html",
        )
        _, text, html = render(content)
        assert 'name="color-scheme" content="light dark"' in html
        assert "@media (prefers-color-scheme: dark)" in html
        assert "[data-ogsc] .v-card" in html
        assert 'class="v-card v-border"' in html
        assert DARK_THEME["background"] in html
        assert "mira@company.example" in text and "mira@company.example" in html
        assert 'href="https://vault.company.example/?item=123"' in html
        assert ":root { color-scheme: dark; }" not in html


def test_forced_dark_preview_uses_same_palette_with_readable_button():
    css = render_dark_styles(force=True)
    assert "@media" not in css
    assert ":root { color-scheme: dark; }" in css
    assert DARK_THEME["ink"] in css
    assert THEME["primary"] in css and THEME["button_text"] in css
    assert ".v-image { filter: none" in css


@pytest.mark.parametrize("recipient", ["mira@company.example", "noah@other.example", None])
def test_link_alerts_use_event_recipient_without_claiming_visitor_identity(monkeypatch, recipient):
    monkeypatch.setattr(notify, "email_enabled", lambda: True)
    owner = SimpleNamespace(name="Owner <Name>", email="owner@company.example", notification_prefs={})
    for function, args in [(notify.link_locked, ()), (notify.link_opened, (False,))]:
        background = BackgroundTasks()
        function(background, owner, recipient, *args)
        to, _, text, html = background.tasks[0].args
        assert to == owner.email
        assert "guest@example.com" not in text
        if recipient:
            assert f"Intended recipient: {recipient}" in text
        else:
            assert "Intended recipient" not in text
        assert "Owner &lt;Name&gt;" in html
        if function == notify.link_locked:
            assert "cannot identify who entered the codes" in text


def test_security_and_sharing_buttons_have_specific_destinations(monkeypatch):
    monkeypatch.setattr(notify, "email_enabled", lambda: True)
    user = SimpleNamespace(name="Mira", email="mira@company.example", notification_prefs={})
    actor = SimpleNamespace(name="Noah", email="noah@company.example")
    background = BackgroundTasks()
    notify.item_shared(background, user, actor, "VIEW")
    text = background.tasks[0].args[2]
    assert "Noah" in text and "/vault?view=shared" in text
    background = BackgroundTasks()
    notify.new_sign_in(background, user, "192.0.2.1", "Chrome/130.0")
    assert "/settings#account-security" in background.tasks[0].args[2]
