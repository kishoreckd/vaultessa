import { useId } from 'react';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { describedBy } from './form-field';

export function EmailCodeField({
  value,
  onChange,
  error,
  hint,
  remaining,
  resendDisabled,
  disabled,
  onResend,
}: {
  value: string;
  onChange: (code: string) => void;
  error?: string;
  hint: string;
  remaining: number;
  resendDisabled: boolean;
  disabled: boolean;
  onResend: () => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>Verification code</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          disabled={resendDisabled}
          onClick={onResend}
        >
          <RefreshCwIcon aria-hidden="true" />
          {remaining ? `Resend in ${remaining}s` : 'Resend code'}
        </Button>
      </div>
      <InputOTP
        id={id}
        maxLength={6}
        required
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern={REGEXP_ONLY_DIGITS}
        value={value}
        onChange={onChange}
        disabled={disabled}
        pasteTransformer={(text) => text.replace(/\D/g, '')}
        aria-invalid={!!error}
        aria-describedby={describedBy(id, error, hint)}
        pushPasswordManagerStrategy="none"
        containerClassName="w-full"
      >
        <InputOTPGroup className="w-full">
          {Array.from({ length: 6 }, (_, index) => (
            <InputOTPSlot key={index} index={index} aria-invalid={!!error} />
          ))}
        </InputOTPGroup>
      </InputOTP>
      <p
        id={error ? `${id}-error` : `${id}-hint`}
        className={error ? 'text-xs text-destructive' : 'text-xs leading-relaxed text-muted-foreground'}
      >
        {error || hint}
      </p>
    </div>
  );
}
