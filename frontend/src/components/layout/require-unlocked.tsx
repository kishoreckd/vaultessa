import { useState } from 'react';
import { RecoverySetup } from '@/features/auth/RecoverySetup';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '@/stores/session';

export function RequireUnlocked() {
  const status = useSession((s) => s.status);
  const [completed, setCompleted] = useState<string | null>(null);
  const accountId = useSession((s) => s.account?.id);
  const verified = useSession((s) => s.account?.emailVerified);
  const location = useLocation();
  if ((status === 'unlocked' || status === 'locked') && !verified)
    return (
      <Navigate
        to="/verify-email"
        state={{ from: location.pathname + location.search + location.hash }}
        replace
      />
    );
  if (status === 'unlocked') {
    if (accountId && completed !== accountId && sessionStorage.getItem(`recovery-setup:${accountId}`) === 'pending')
      return <RecoverySetup onDone={() => {
        sessionStorage.removeItem(`recovery-setup:${accountId}`);
        setCompleted(accountId);
      }} />;
    return <Outlet />;
  }
  return (
    <Navigate
      to={status === 'locked' ? '/unlock' : '/login'}
      state={{ from: location.pathname + location.search + location.hash }}
      replace
    />
  );
}
