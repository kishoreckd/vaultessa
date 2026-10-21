import { useId, type ComponentProps, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type FieldProps = {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
};

/** Label + control + hint/error, wired with ids for accessibility. */
export function FormField({
  id,
  label,
  hint,
  error,
  className,
  children,
}: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({ label, hint, error, className, ...props }: FieldProps & ComponentProps<typeof Input>) {
  const id = useId();
  return (
    <FormField id={id} label={label} hint={hint} error={error} className={className}>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...props}
      />
    </FormField>
  );
}

export function TextareaField({ label, hint, error, className, ...props }: FieldProps & ComponentProps<typeof Textarea>) {
  const id = useId();
  return (
    <FormField id={id} label={label} hint={hint} error={error} className={className}>
      <Textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...props}
      />
    </FormField>
  );
}
