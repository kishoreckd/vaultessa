import type { SecretType } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { TEMPLATES } from './secretTemplates';

/** Logins show their initial (recognisable at a glance); other types show their type icon. */
export function ItemAvatar({ type, name, size = 'md' }: { type: SecretType; name: string; size?: 'md' | 'lg' }) {
  const template = TEMPLATES[type];
  const Icon = template.icon;
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg font-semibold uppercase',
        size === 'lg' ? 'size-11 text-lg' : 'size-9 text-sm',
        template.tint,
      )}
    >
      {type === 'LOGIN' && name.trim() ? name.trim().charAt(0) : <Icon className={size === 'lg' ? 'size-5' : 'size-4'} />}
    </span>
  );
}
