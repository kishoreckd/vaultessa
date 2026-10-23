import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { Loading } from '@/components/common/page';
import { RequireUnlocked } from '@/components/layout/require-unlocked';
import { setAccessToken, setUnauthorizedHandler } from '@/api/client';
import { authDestination } from '@/lib/auth-destination';
import { useSession } from '@/stores/session';
import { useUnlockExpiry } from '@/hooks/useAutoLock';
import { LEGACY_VAULT_ROUTES } from '@/lib/vault-routes';

const TeamsPage = lazy(() => import('@/features/teams/TeamsPage').then((m) => ({ default: m.TeamsPage })));
const LandingPage = lazy(() => import('@/Landing/LandingPage').then((m) => ({ default: m.LandingPage })));
const MarketingPage = lazy(() => import('@/Landing/MarketingPage').then((m) => ({ default: m.MarketingPage })));
const AppLayout = lazy(() => import('@/components/layout/app-layout').then((m) => ({ default: m.AppLayout })));
const LoginPage = lazy(() => import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('@/features/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const UnlockPage = lazy(() => import('@/features/auth/UnlockPage').then((m) => ({ default: m.UnlockPage })));
const EmailVerificationPage = lazy(() => import('@/features/auth/RecoveryPages').then((m) => ({ default: m.EmailVerificationPage })));
const ForgotPasswordPage = lazy(() => import('@/features/auth/RecoveryPages').then((m) => ({ default: m.ForgotPasswordPage })));
const RecoverVaultPage = lazy(() => import('@/features/auth/RecoveryPages').then((m) => ({ default: m.RecoverVaultPage })));
const SecurityPage = lazy(() => import('@/features/security/SecurityPage').then((m) => ({ default: m.SecurityPage })));
const GuestSharePage = lazy(() => import('@/features/shares/GuestSharePage').then((m) => ({ default: m.GuestSharePage })));
const SharedLinksPage = lazy(() => import('@/features/shares/SharedLinksPage').then((m) => ({ default: m.SharedLinksPage })));
const VaultPage = lazy(() => import('@/features/vault/VaultPage').then((m) => ({ default: m.VaultPage })));

const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({
    default: m.SettingsPage,
  })),
);
const DeveloperPage = lazy(() =>
  import('@/features/developer/DeveloperPage').then((m) => ({
    default: m.DeveloperPage,
  })),
);
const GeneratorPage = lazy(() =>
  import('@/features/generator/GeneratorPage').then((m) => ({
    default: m.GeneratorPage,
  })),
);
const AuditPage = lazy(() => import('@/features/audit/AuditPage').then((m) => ({ default: m.AuditPage })));

setUnauthorizedHandler(() => {
  setAccessToken(null);
  useSession.getState().clear();
});

export function App() {
  useUnlockExpiry();
  const status = useSession((s) => s.status);
  const { pathname } = useLocation();
  const publicPage = ['/', '/features', '/security', '/how-it-works'].includes(pathname);

  useEffect(() => {
    if (publicPage) return;
    void import('@/features/auth/authFlows').then(({ bootstrapSession }) => bootstrapSession()).catch(() => useSession.getState().clear());
  }, [publicPage]);

  return (
    <Suspense fallback={<FullPageLoading />}>
      <Routes>
        {Object.entries(LEGACY_VAULT_ROUTES).map(([oldPath, newPath]) => (
          <Route key={oldPath} path={oldPath} element={<LegacyVaultRedirect to={newPath} />} />
        ))}
        <Route path="/features" element={<MarketingPage pageKey="features" />} />
        <Route path="/security" element={<MarketingPage pageKey="security" />} />
        <Route path="/how-it-works" element={<MarketingPage pageKey="how-it-works" />} />
        <Route path="/" element={<LandingRoute />} />
        {/* Public guest page: works without an account and regardless of session state. */}
        <Route path="/s/:id" element={<GuestSharePage />} />
        <Route path="/verify-email" element={<EmailVerificationPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/recover" element={<RecoverVaultPage />} />
        <Route path="*" element={status === 'booting' ? <FullPageLoading /> : <AuthenticatedRoutes />} />
      </Routes>
    </Suspense>
  );
}

function LegacyVaultRedirect({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} state={location.state} replace />;
}

function LandingRoute() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  // Compatibility with item and shared-view links delivered before /vault existed.
  return params.has('item') || params.get('view') === 'shared'
    ? <LegacyVaultRedirect to="/vault" />
    : <LandingPage />;
}

function FullPageLoading() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Loading />
    </div>
  );
}

function AuthenticatedRoutes() {
  const status = useSession((s) => s.status);
  const account = useSession((s) => s.account);
  const location = useLocation();
  const home =
    account && !account.emailVerified
      ? '/verify-email'
      : status === 'unlocked'
        ? authDestination(location.state)
        : status === 'locked'
          ? '/unlock'
          : null;

  return (
    <Routes>
      <Route
        path="/login"
        element={home ? <Navigate to={home} state={location.state} replace /> : <LoginPage />}
      />
      <Route
        path="/register"
        element={home ? <Navigate to={home} state={location.state} replace /> : <RegisterPage />}
      />
      <Route
        path="/unlock"
        element={
          status === 'locked' && account?.emailVerified ? (
            <UnlockPage />
          ) : (
            <Navigate to={home ?? '/login'} state={location.state} replace />
          )
        }
      />
      <Route element={<RequireUnlocked />}>
        <Route element={<AppLayout />}>
          <Route path="vault" element={<VaultPage />} />
          <Route path="vault/security" element={<SecurityPage />} />
          <Route path="vault/links" element={<SharedLinksPage />} />
          <Route path="vault/generator" element={<GeneratorPage />} />
          <Route path="vault/activity" element={<AuditPage />} />
          <Route path="vault/settings" element={<SettingsPage />} />
          <Route path="vault/teams" element={<TeamsPage />} />
          <Route path="vault/developer" element={<DeveloperPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
