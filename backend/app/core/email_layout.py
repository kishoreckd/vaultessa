"""One consistent layout for every email (plain-text + HTML). Never put secrets in emails."""

from dataclasses import dataclass, field
from html import escape

from ..config import get_settings


@dataclass
class EmailContent:
    subject: str
    heading: str
    paragraphs: list[str]
    button: tuple[str, str] | None = None  # (label, url)
    details: list[tuple[str, str]] = field(default_factory=list)  # label/value rows
    footnote: str = "You're receiving this because of activity on your Vaultessa account."
    tone: str = "info"  # "info" | "alert"
    mark: str = "lock"  # "lock" (account email) | "unlock" (guest share invitation)


def _brand_header(mark: str) -> str:
    # PNG, not SVG: Gmail and Outlook strip SVG images. The text wordmark still shows when images are blocked.
    src = f"{get_settings().app_base_url.rstrip('/')}/brand/email-{'unlock' if mark == 'unlock' else 'mark'}.png"
    return (
        f'<img src="{escape(src, quote=True)}" width="28" height="28" alt="" '
        'style="display:inline-block;vertical-align:middle;border:0;margin-right:8px">'
        '<span style="vertical-align:middle;letter-spacing:-0.3px">Vaultessa</span>'
    )


def render(content: EmailContent) -> tuple[str, str, str]:
    """Returns (subject, text, html)."""
    text_lines = [content.heading, "", *content.paragraphs]
    if content.details:
        text_lines += ["", *(f"{k}: {v}" for k, v in content.details)]
    if content.button:
        text_lines += ["", f"{content.button[0]}: {content.button[1]}"]
    text_lines += ["", content.footnote]
    text = "\n".join(text_lines)

    accent = "#dc2626" if content.tone == "alert" else "#4f46e5"
    paragraphs = "".join(
        f'<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#374151">{escape(p)}</p>'
        for p in content.paragraphs
    )
    details = ""
    if content.details:
        rows = "".join(
            f'<tr><td style="padding:6px 16px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap">{escape(k)}</td>'
            f'<td style="padding:6px 0;color:#111827">{escape(v)}</td></tr>'
            for k, v in content.details
        )
        details = f'<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:13px;margin:4px 0 8px">{rows}</table>'
    button = ""
    if content.button:
        label, url = content.button
        button = (
            f'<p style="margin:20px 0 8px"><a href="{escape(url, quote=True)}" style="display:inline-block;background:{accent};'
            f'color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px">{escape(label)}</a></p>'
            f'<p style="margin:0;font-size:12px;color:#6b7280">Button not working? Open: '
            f'<span style="word-break:break-all;color:{accent}">{escape(url)}</span></p>'
        )

    html = f"""<!doctype html>
<html><body style="margin:0;background:#f4f4f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb">
<tr><td style="height:4px;background:{accent};border-radius:12px 12px 0 0"></td></tr>
<tr><td style="padding:22px 28px 0;font-weight:600;font-size:16px;color:#4f46e5">{_brand_header(content.mark)}</td></tr>
<tr><td style="padding:14px 28px 4px;font-size:20px;font-weight:600;color:#111827">{escape(content.heading)}</td></tr>
<tr><td style="padding:8px 28px 4px">{paragraphs}{details}{button}</td></tr>
<tr><td style="padding:18px 28px 22px;font-size:12px;color:#6b7280;border-top:1px solid #f3f4f6">{escape(content.footnote)}</td></tr>
</table></td></tr></table></body></html>"""
    return content.subject, text, html
