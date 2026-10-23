import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { Loading } from '@/components/common/page';
import { AppLayout } from '@/components/layout/app-layout';
import { RequireUnlocked } from '@/components/layout/require-unlocked';
import { bootstrapSession } from '@/features/auth/authFlows';
import { LoginPage } from '@/features/auth/LoginPage';
import { EmailVerificationPage, ForgotPasswordPage, RecoverVaultPage } from '@/features/auth/RecoveryPages';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { UnlockPage } from '@/features/auth/UnlockPage';
import { SecurityPage } from '@/features/security/SecurityPage';
import { GuestSharePage } from '@/features/shares/GuestSharePage';
import { SharedLinksPage } from '@/features/shares/SharedLinksPage';
import { VaultPage } from '@/features/vault/VaultPage';
import { setAccessToken, setUnauthorizedHandler } from '@/api/client';
import { authDestination } from '@/lib/auth-destination';
import { useSession } from '@/stores/session';

const TeamsPage = lazy(() => import('@/features/teams/TeamsPage').then((m) => ({ default: m.TeamsPage })));

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
  const status = useSession((s) => s.status);

  useEffect(() => {
    void bootstrapSession();
  }, []);

  return (
    <Suspense fallback={<FullPageLoading />}>
      <Routes>
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
          <Route index element={<VaultPage />} />
          <Route path="security" element={<SecurityPage />} />
          <Route path="links" element={<SharedLinksPage />} />
          <Route path="generator" element={<GeneratorPage />} />
          <Route path="activity" element={<AuditPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="teams" element={<TeamsPage />} />
          <Route path="developer" element={<DeveloperPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
