import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { useTheme } from 'next-themes';
import { expect, it } from 'vitest';
import { AppTheme } from '../src/components/layout/app-theme';

function ThemeProbe() {
  const { forcedTheme } = useTheme();
  return <span data-forced-theme={forcedTheme ?? 'user-preference'} />;
}

it.each(['/', '/features', '/security', '/how-it-works'])('forces %s and its body portals to light mode', path => {
  const html = renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><AppTheme><ThemeProbe /></AppTheme></MemoryRouter>);
  expect(html).toContain('data-forced-theme="light"');
});

it.each(['/vault', '/vault/settings', '/login'])('preserves the saved theme on %s', path => {
  const html = renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><AppTheme><ThemeProbe /></AppTheme></MemoryRouter>);
  expect(html).toContain('data-forced-theme="user-preference"');
});
