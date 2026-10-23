import { LEGACY_VAULT_ROUTES } from './vault-routes';

/** Only resume known app routes; never redirect authentication to an external URL. */
export function authDestination(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || /[\\\r\n]/.test(from))
    return '/vault';
  const pathname = from.split(/[?#]/)[0] ?? '/';
  if (pathname === '/') {
    const params = new URLSearchParams(from.split('#')[0]!.split('?')[1]);
    if (params.has('item') || params.get('view') === 'shared') return '/vault' + from.slice(1);
  }
  if (Object.hasOwn(LEGACY_VAULT_ROUTES, pathname)) return LEGACY_VAULT_ROUTES[pathname] + from.slice(pathname.length);
  return [
    '/vault',
    '/vault/teams',
    '/vault/settings',
    '/vault/links',
    '/vault/developer',
    '/vault/activity',
    '/vault/security',
    '/vault/generator',
  ].includes(pathname)
    ? from
    : '/vault';
}
