import { describe, expect, it } from 'vitest';
import { authDestination } from '../src/lib/auth-destination';

describe('email destinations after authentication', () => {
  it.each([
    '/vault?item=123',
    '/vault/teams?invitation=123',
    '/vault?view=shared',
    '/vault/settings#account-security',
    '/vault/links',
    '/vault/developer',
    '/vault/generator',
    '/vault/activity',
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
    expect(authDestination({ from })).toBe('/vault');
  });
  it('handles absent state', () => {
    expect(authDestination(null)).toBe('/vault');
  });
  it.each(['teams', 'settings', 'links', 'developer', 'generator', 'activity'])('canonicalizes legacy %s links without dropping query or fragment', route => {
    expect(authDestination({ from: `/${route}?invitation=123#details` })).toBe(`/vault/${route}?invitation=123#details`);
  });
  it('resumes item links from old notification emails under /vault', () => {
    expect(authDestination({ from: '/?item=123#details' })).toBe('/vault?item=123#details');
    expect(authDestination({ from: '/?view=shared' })).toBe('/vault?view=shared');
  });
});
