import { useId, type ComponentProps, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type FieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
};

/** ids for aria-describedby: the error replaces the hint while it's shown. */
export function describedBy(id: string, error?: string | null, hint?: ReactNode) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

/**
 * Label + control + hint/error, wired with ids for accessibility.
 * Forms use `noValidate` + useFormErrors, so errors render here instead of as browser popups.
 */
export function FormField({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps & { id: string; required?: boolean; children: ReactNode }) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-xs font-medium text-destructive">
          <CircleAlert className="mt-px size-3.5 shrink-0" />
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
    <FormField id={id} label={label} hint={hint} error={error} required={props.required} className={className}>
      <Input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)} {...props} />
    </FormField>
  );
}

export function TextareaField({ label, hint, error, className, ...props }: FieldProps & ComponentProps<typeof Textarea>) {
  const id = useId();
  return (
    <FormField id={id} label={label} hint={hint} error={error} required={props.required} className={className}>
      <Textarea id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)} {...props} />
    </FormField>
  );
}
