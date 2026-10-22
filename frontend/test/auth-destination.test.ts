import { describe, expect, it } from 'vitest';
import { authDestination } from '../src/lib/auth-destination';

describe('email destinations after authentication', () => {
  it.each([
    '/?item=123',
    '/teams?invitation=123',
    '/?view=shared',
    '/settings#account-security',
    '/links',
    '/developer',
  ])('preserves %s', (from) => {
    expect(authDestination({ from })).toBe(from);
  });
  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/login',
    '/unknown',
    '/%2f%2fevil.example',
  ])('rejects %s', (from) => {
    expect(authDestination({ from })).toBe('/');
  });
  it('handles absent state', () => {
    expect(authDestination(null)).toBe('/');
  });
});
