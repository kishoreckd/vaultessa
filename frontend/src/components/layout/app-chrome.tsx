import { lazy, Suspense } from 'react';
import { useLocation } from 'react-router';

const ConfirmDialogHost = lazy(() => import('@/components/common/confirm-dialog').then((m) => ({default:m.ConfirmDialogHost})));
const Toaster = lazy(() => import('@/components/ui/sonner').then((m) => ({default:m.Toaster})));

export function AppChrome() {
  const { pathname } = useLocation();
  if (['/', '/features','/security','/how-it-works'].includes(pathname)) return null;
  return <Suspense fallback={null}><Toaster position="top-right" offset={{top:72,right:24}} mobileOffset={{top:64}} richColors closeButton/><ConfirmDialogHost/></Suspense>;
}
