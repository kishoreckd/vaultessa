import { Navigate, Outlet } from 'react-router';
import { useSession } from '@/stores/session';

export function RequireUnlocked() {
  const status = useSession((s) => s.status);
  if (status === 'unlocked') return <Outlet />;
  return <Navigate to={status === 'locked' ? '/unlock' : '/login'} replace />;
}
