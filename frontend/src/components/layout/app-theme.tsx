import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { useLocation } from 'react-router';

/** Force public pages light without changing the saved product theme. */
export function AppTheme({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const marketing = ['/', '/features', '/security', '/how-it-works'].includes(pathname);
  return <ThemeProvider attribute="class" defaultTheme="system" enableSystem
    storageKey="pv-theme" disableTransitionOnChange forcedTheme={marketing ? 'light' : undefined}>
    {children}
  </ThemeProvider>;
}
