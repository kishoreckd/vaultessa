from pathlib import Path

import pytest

from app.constants.email import EMAIL_ASSETS, ILLUSTRATIONS
from app.services.email_templates import EmailContent, render


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
