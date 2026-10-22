import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '@/stores/session';

export function RequireUnlocked() {
  const status = useSession((s) => s.status);
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
  if (status === 'unlocked') return <Outlet />;
  return (
    <Navigate
      to={status === 'locked' ? '/unlock' : '/login'}
      state={{ from: location.pathname + location.search + location.hash }}
      replace
    />
  );
}
