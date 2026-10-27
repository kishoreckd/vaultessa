import { useId, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { CircleAlert, CircleCheck, Circle, LoaderCircle, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { TextField } from '@/components/common/form-field';
import { PasswordInput } from '@/components/common/password-input';
import { StrengthMeter } from '@/components/common/strength-meter';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useFormErrors } from '@/hooks/useFormErrors';
import { ApiError } from '@/api/client';
import { emailError, requiredText } from '@/lib/validation';
import { estimateStrength } from '@/lib/crypto';
import { useStrengthEstimator } from '@/hooks/useStrengthEstimator';
import { cn } from '@/lib/utils';
import { authDestination } from '@/lib/auth-destination';
import { AuthCard } from './AuthCard';
import { register } from './authFlows';

const MIN_LENGTH = 10;

function Requirement({ met, children }: { met: boolean; children: string }) {
  const Icon = met ? CircleCheck : Circle;
  return (
    <li className={cn('flex items-center gap-1.5', met ? 'text-success' : 'text-muted-foreground')}>
      <Icon className="size-3.5" />
      <span>
        {children}
        <span className="sr-only">{met ? ' (done)' : ' (not yet)'}</span>
      </span>
    </li>
  );
}

export function RegisterPage() {
  const strengthEstimator = useStrengthEstimator();
  const navigate = useNavigate();
  const location = useLocation();
  const destination = authDestination(location.state);
  const ackId = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const strength = useMemo(() => estimateStrength(password), [password, strengthEstimator.data]);

  const longEnough = password.length >= MIN_LENGTH;
  const strongEnough = strength.score >= 2;
  const matches = password.length > 0 && password === confirm;
  const { formRef, errors, validate, clear } = useFormErrors<
    'name' | 'email' | 'password' | 'confirm' | 'ack'
  >();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    const ok = validate({
      name: requiredText(name, 'your name'),
      email: emailError(email),
      password: !password
        ? 'Choose a master password.'
        : !longEnough
          ? `Use at least ${MIN_LENGTH} characters.`
          : !strongEnough
            ? 'Make it harder to guess — add more words or characters.'
            : null,
      confirm: !confirm
        ? 'Type your master password again.'
        : !matches
          ? 'The two passwords don’t match.'
          : null,
      ack: acknowledged ? null : 'Confirm that you understand how vault recovery works.',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await register({ name, email, password });
      toast.success('Check your inbox', {
        description: 'Verify your email address before opening your vault.',
      });
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create your account. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Create your vault" subtitle="Your encryption keys are created in this browser.">
      <form ref={formRef} onSubmit={onSubmit} className="grid gap-4" noValidate>
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <TextField
          label="Your name"
          autoComplete="name"
          required
          maxLength={100}
          value={name}
          error={errors.name}
          onChange={(e) => {
            setName(e.target.value);
            clear('name');
          }}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          required
          value={email}
          error={errors.email}
          onChange={(e) => {
            setEmail(e.target.value);
            clear('email');
          }}
        />
        <div className="grid gap-2">
          <PasswordInput
            label="Master password"
            autoComplete="new-password"
            required
            hint="Tip: four or more random, unrelated words are strong and easy to remember."
            value={password}
            error={errors.password}
            onChange={(e) => {
              setPassword(e.target.value);
              clear('password');
            }}
          />
          {password && <StrengthMeter strength={strength} />}
          {strengthEstimator.isError && (
            <div role="alert" className="grid gap-2 text-sm">
              <p>Could not load password strength checks. Retry before creating your vault.</p>
              <Button type="button" variant="outline" onClick={() => void strengthEstimator.refetch()}>Retry checks</Button>
            </div>
          )}
        </div>
        <PasswordInput
          label="Confirm master password"
          autoComplete="new-password"
          required
          value={confirm}
          error={errors.confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            clear('confirm');
          }}
        />
        <ul className="grid gap-1 rounded-lg bg-muted/60 p-3 text-xs" aria-label="Master password checklist">
          <Requirement met={longEnough}>{`At least ${MIN_LENGTH} characters`}</Requirement>
          <Requirement met={strongEnough}>Strength “Fair” or better</Requirement>
          <Requirement met={matches}>Both entries match</Requirement>
        </ul>
        <Alert className="border-warning/40 bg-warning/10">
          <TriangleAlert className="text-warning" />
          <AlertTitle>Only you can unlock your vault</AlertTitle>
          <AlertDescription>
            Vaultessa can’t see your master password. Recovery requires a verified email and a vault recovery
            key saved in advance. After email verification, we will help you create and save your recovery key.
            <div className="mt-2 flex items-center gap-2">
              <Checkbox
                id={ackId}
                checked={acknowledged}
                aria-invalid={errors.ack ? true : undefined}
                aria-describedby={errors.ack ? `${ackId}-error` : undefined}
                onCheckedChange={(v) => {
                  setAcknowledged(v === true);
                  clear('ack');
                }}
              />
              <Label htmlFor={ackId} className="text-sm font-normal text-foreground">
                I understand that Vaultessa cannot retrieve my master password
              </Label>
            </div>
            {errors.ack && (
              <p
                id={`${ackId}-error`}
                className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-destructive"
              >
                <CircleAlert className="size-3.5" />
                {errors.ack}
              </p>
            )}
          </AlertDescription>
        </Alert>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <LoaderCircle className="animate-spin" />}
          {busy ? 'Creating your encryption keys…' : 'Create my vault'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          state={{ from: destination }}
          to="/login"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
