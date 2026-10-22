import { useId, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react';
import { Eye, EyeOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { describedBy, FormField } from '@/components/common/form-field';
import { IconAction } from '@/components/common/icon-action';
import { cn } from '@/lib/utils';

type Props = Omit<ComponentProps<typeof Input>, 'type'> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  /** shows a "generate" action (password fields in the item editor) */
  onGenerate?: () => void;
};

/**
 * Password input with show/hide and a Caps Lock warning — the #1 cause of
 * "wrong master password" (docs/08-personas-and-ux.md, persona Priya).
 */
export function PasswordInput({ label, hint, error, onGenerate, className, ...props }: Props) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const checkCaps = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState('CapsLock'));
  const actions = onGenerate ? 2 : 1;
  const shownHint = capsLock ? (
    <span className="flex items-center gap-1 font-medium text-warning" role="status">
      <TriangleAlert className="size-3.5" /> Caps Lock is on
    </span>
  ) : (
    hint
  );

  return (
    <FormField id={id} label={label} error={error} required={props.required} className={className} hint={shownHint}>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          spellCheck={false}
          autoCapitalize="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, shownHint)}
          className={cn(actions === 2 ? 'pr-16' : 'pr-9')}
          onKeyDown={checkCaps}
          onKeyUp={checkCaps}
          onBlur={() => setCapsLock(false)}
          {...props}
        />
        <div className="absolute inset-y-0 right-0.5 flex items-center">
          {onGenerate && (
            <IconAction label="Generate a strong password" size="icon-xs" onClick={onGenerate}>
              <RefreshCw />
            </IconAction>
          )}
          <IconAction label={visible ? 'Hide' : 'Show'} size="icon-xs" onClick={() => setVisible((v) => !v)}>
            {visible ? <EyeOff /> : <Eye />}
          </IconAction>
        </div>
      </div>
    </FormField>
  );
}
