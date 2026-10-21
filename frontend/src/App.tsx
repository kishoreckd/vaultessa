import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { Loading } from '@/components/common/page';
import { AppLayout } from '@/components/layout/app-layout';
import { RequireUnlocked } from '@/components/layout/require-unlocked';
import { AuditPage } from '@/features/audit/AuditPage';
import { bootstrapSession } from '@/features/auth/authFlows';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { UnlockPage } from '@/features/auth/UnlockPage';
import { GeneratorPage } from '@/features/generator/GeneratorPage';
import { SecurityPage } from '@/features/security/SecurityPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { GuestSharePage } from '@/features/shares/GuestSharePage';
import { SharedLinksPage } from '@/features/shares/SharedLinksPage';
import { VaultPage } from '@/features/vault/VaultPage';
import { setAccessToken, setUnauthorizedHandler } from '@/lib/api/client';
import { useSession } from '@/stores/session';

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
    <Routes>
      {/* Public guest page: works without an account and regardless of session state. */}
      <Route path="/s/:id" element={<GuestSharePage />} />
      <Route path="*" element={status === 'booting' ? <FullPageLoading /> : <AuthenticatedRoutes />} />
    </Routes>
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
  const home = status === 'unlocked' ? '/' : status === 'locked' ? '/unlock' : null;

  return (
    <Routes>
      <Route path="/login" element={home ? <Navigate to={home} replace /> : <LoginPage />} />
      <Route path="/register" element={home ? <Navigate to={home} replace /> : <RegisterPage />} />
      <Route path="/unlock" element={status === 'locked' ? <UnlockPage /> : <Navigate to={home ?? '/login'} replace />} />
      <Route element={<RequireUnlocked />}>
        <Route element={<AppLayout />}>
          <Route index element={<VaultPage />} />
          <Route path="security" element={<SecurityPage />} />
          <Route path="links" element={<SharedLinksPage />} />
          <Route path="generator" element={<GeneratorPage />} />
          <Route path="activity" element={<AuditPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
