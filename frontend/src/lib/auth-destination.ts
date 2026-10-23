/** Only resume known app routes; never redirect authentication to an external URL. */
export function authDestination(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || /[\\\r\n]/.test(from))
    return '/vault';
  const pathname = from.split(/[?#]/)[0] ?? '/';
  return [
    '/vault',
    '/teams',
    '/settings',
    '/links',
    '/developer',
    '/activity',
    '/vault/security',
    '/generator',
  ].includes(pathname)
    ? from
    : '/vault';
}
