import { useEffect } from 'react';
import { useLocation } from 'react-router';

const descriptions: Record<string,string> = {
  '/': 'Keep passwords organised, share selected items securely, and stay in control of your keys with Vaultessa.',
  '/features': 'Explore Vaultessa password generation, vault organisation, secure sharing and recovery features.',
  '/security': 'Understand Vaultessa browser encryption, protected keys, two-step verification and recovery requirements.',
  '/how-it-works': 'Learn how to create your Vaultessa vault, save passwords, share items and prepare your recovery key.',
};
export function PageMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    const isPublic = pathname in descriptions;
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (robots) robots.content = isPublic ? 'index, follow' : 'noindex, nofollow';
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = isPublic ? descriptions[pathname]! : 'Access your private Vaultessa account.';
  }, [pathname]);
  return null;
}
