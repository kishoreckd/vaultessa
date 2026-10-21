import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Vaultessa brand marks (source of truth: public/brand/*.svg).
 * Drawn in `currentColor` with a true V cut-out, so they follow the theme's `text-*` colour.
 */

/** Primary mark: padlock with a V cut into the body. Use in the app header and anywhere small. */
export function VaultessaMark({ className, title }: { className?: string; title?: string }) {
  const maskId = useId();
  return (
    <svg viewBox="0 0 64 64" className={cn('size-7 shrink-0', className)} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect x="12" y="27" width="40" height="31" rx="9" fill="#fff" />
          <path d="M23.5 35L32 50L40.5 35" fill="none" stroke="#000" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      </defs>
      <path d="M21 29V21C21 14.9 25.9 10 32 10C38.1 10 43 14.9 43 21V29" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
      <rect x="12" y="27" width="40" height="31" rx="9" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}

/** Secondary "unlock" mark: the padlock with a key turning in it. Use on sign-in, unlock and guest-share screens. */
export function VaultessaUnlockMark({ className, title }: { className?: string; title?: string }) {
  const maskId = useId();
  return (
    <svg viewBox="0 0 64 64" className={cn('size-10 shrink-0', className)} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect x="6" y="27" width="40" height="31" rx="9" fill="#fff" />
          <path d="M17.5 35L26 50L34.5 35" fill="none" stroke="#000" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      </defs>
      <path d="M15 29V21C15 14.9 19.9 10 26 10C32.1 10 37 14.9 37 21V29" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
      <rect x="6" y="27" width="40" height="31" rx="9" fill="currentColor" mask={`url(#${maskId})`} />
      <rect x="44" y="40.5" width="9" height="5" rx="2" fill="currentColor" />
      <circle cx="56.5" cy="43" r="5" fill="none" stroke="currentColor" strokeWidth="3.5" />
    </svg>
  );
}

/** Mark + wordmark lockup. `variant="unlock"` swaps in the key mark for auth and guest screens. */
export function VaultessaLogo({ variant = 'lock', className }: { variant?: 'lock' | 'unlock'; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-heading font-semibold tracking-[-0.03em]', className)}>
      {variant === 'unlock' ? (
        <VaultessaUnlockMark className="size-9 text-primary" />
      ) : (
        <VaultessaMark className="text-primary" />
      )}
      Vaultessa
    </span>
  );
}
