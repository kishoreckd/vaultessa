import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  Activity,
  Building2,
  Keyboard,
  Link2,
  Lock,
  LogOut,
  Monitor,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  Vault,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { VaultessaLogo } from '@/components/common/brand';
import { IconAction } from '@/components/common/icon-action';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { ShortcutsDialog } from '@/components/layout/shortcuts-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logout } from '@/features/auth/authFlows';
import { useAutoLock } from '@/hooks/useAutoLock';
import { useHotkeys } from '@/hooks/useHotkeys';
import { usePrefs } from '@/lib/prefs';
import { cn } from '@/lib/utils';
import { useSession } from '@/stores/session';

const NAV: Array<{
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}> = [
  { to: '/vault', label: 'Vault', icon: Vault, end: true },
  { to: '/vault/security', label: 'Security', icon: ShieldCheck },
  { to: '/generator', label: 'Generator', icon: WandSparkles },
  { to: '/links', label: 'Shared', icon: Link2 },
  { to: '/teams', label: 'Teams', icon: Building2 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function initials(name?: string) {
  return (name ?? '?')
    .split(' ')
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function AppLayout() {
  const isVault = useLocation().pathname === '/vault';
  useAutoLock();
  const account = useSession((s) => s.account);
  const lock = useSession((s) => s.lock);
  const autoLockMinutes = usePrefs((s) => s.autoLockMinutes);
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useHotkeys({ '?': () => setShortcutsOpen(true), l: () => lock('manual') });

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className={cn('flex flex-col', isVault ? 'h-svh overflow-hidden' : 'min-h-svh')}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 shrink-0 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <NavLink to="/" aria-label="Vaultessa home">
            <VaultessaLogo className="text-base" />
          </NavLink>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <IconAction
              label="Keyboard shortcuts (?)"
              className="hidden sm:inline-flex"
              onClick={() => setShortcutsOpen(true)}
            >
              <Keyboard />
            </IconAction>
            <ThemeToggle />
            <Button
              variant="outline"
              title={`Lock now — auto-locks after ${autoLockMinutes} min idle`}
              onClick={() => lock('manual')}
            >
              <Lock /> <span className="hidden sm:inline">Lock</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="ml-1 rounded-full" aria-label="Account menu">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {initials(account?.name)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="grid">
                  <span className="truncate">{account?.name}</span>
                  <span className="truncate text-xs font-normal text-muted-foreground">{account?.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate('/links')}>
                  <Link2 /> Shared links
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate('/settings')}>
                  <Settings /> Settings
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate('/activity')}>
                  <Activity /> Activity log
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate('/developer')}>
                  <Keyboard /> Developer access
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Sun /> Theme
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
                      <DropdownMenuRadioItem value="light">
                        <Sun /> Light
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="dark">
                        <Moon /> Dark
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="system">
                        <Monitor /> System
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
                  <Keyboard /> Keyboard shortcuts
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onLogout}>
                  <LogOut /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main id="main" className={cn('mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-6 lg:pb-8', isVault && 'min-h-0 overflow-hidden')}>
        <Outlet />
      </main>

      {/* Bottom tab bar on phones (thumb reach). */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t bg-background lg:hidden"
      >
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 py-2 text-[11px]',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )
            }
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        ))}
      </nav>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
