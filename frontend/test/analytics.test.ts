import { describe, expect, it } from 'vitest';
import { analyticsPage, safeAction, safeDestination } from '../src/analytics/events';

describe('analytics privacy boundary', () => {
  it('uses static page names without query strings, fragments or share identifiers', () => {
    expect(analyticsPage('/s/secret-share?email=private#recovery-key')).toEqual({path:'/s/:id',title:'Guest share'});
    expect(analyticsPage('/settings?email=private#account')).toEqual({path:'/settings',title:'Settings'});
    expect(analyticsPage('/private-user-email@example.com')).toEqual({path:'/not-found',title:'Not found'});
    expect(analyticsPage('/', true).path).toBe('/vault');
    expect(analyticsPage('/').path).toBe('/');
  });
  it.each(['/login','/register','/unlock','/verify-email','/recover','/forgot-password','/features','/security','/how-it-works','/vault/security','/settings','/teams','/developer','/links','/generator','/activity'])('recognizes the %s screen', (path) => {
    expect(analyticsPage(path).path).toBe(path);
  });
  it('never sends arbitrary control labels or user content', () => {
    expect(safeAction('sarah@example.com')).toBe('control');
    expect(safeAction('my private vault item')).toBe('control');
    expect(safeAction('Recovery key: private-value')).toBe('control');
    expect(safeAction('Create your vault')).toBe('create_vault');
    expect(safeAction('＋ Add item')).toBe('add_item');
  });
  it('strips destinations to allowlisted routes, static sections or external markers', () => {
    const origin = 'https://vaultessa.example';
    expect(safeDestination('/s/private-token#private-key', origin)).toBe('/s/:id');
    expect(safeDestination('/settings?email=private', origin)).toBe('/settings');
    expect(safeDestination('https://private.example/path?secret=value', origin)).toBe('external');
    expect(safeDestination('#recovery-key', origin)).toBe('section');
    expect(safeDestination('#detail-2', origin)).toBe('#detail-2');
  });
});
