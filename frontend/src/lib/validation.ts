// Field validators for forms. Each returns an error message, or null when the value is fine.
// Messages say what to do, not what went wrong (docs/08-personas-and-ux.md, content style).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function requiredText(value: string, what: string): string | null {
  return value.trim() ? null : `Enter ${what}.`;
}

export function emailError(value: string, { optional = false } = {}): string | null {
  const v = value.trim();
  if (!v) return optional ? null : 'Enter an email address.';
  return EMAIL_RE.test(v) ? null : 'Enter an email like name@company.com.';
}

/** Adds https:// when the user typed a bare domain like "github.com". Returns null when it can't be a web address. */
export function normalizeUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return '';
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const url = new URL(withScheme);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return withScheme;
  } catch {
    return null;
  }
}

export function urlError(value: string): string | null {
  return normalizeUrl(value) === null ? 'Enter a web address like https://example.com.' : null;
}

export function portError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const n = Number(v);
  return /^\d+$/.test(v) && n >= 1 && n <= 65535 ? null : 'Enter a port number from 1 to 65535.';
}

export function dateError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? null : 'Use the format YYYY-MM-DD.';
}
