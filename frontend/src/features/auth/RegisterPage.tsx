import { useId, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { CircleAlert, CircleCheck, Circle, LoaderCircle, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { TextField } from '@/components/common/form-field';
import { PasswordInput } from '@/components/common/password-input';
import { StrengthMeter } from '@/components/common/strength-meter';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api/client';
import { estimateStrength } from '@/lib/crypto';
import { cn } from '@/lib/utils';
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
  const navigate = useNavigate();
  const ackId = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const strength = useMemo(() => estimateStrength(password), [password]);

  const longEnough = password.length >= MIN_LENGTH;
  const strongEnough = strength.score >= 2;
  const matches = password.length > 0 && password === confirm;
  const ready = longEnough && strongEnough && matches && acknowledged && !!name.trim() && !!email.trim();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!ready) return setError('Finish the checklist above to continue.');
    setBusy(true);
    try {
      await register({ name, email, password });
      toast.success('Your vault is ready', { description: 'Start by adding your most-used login.' });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create your account. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Create your vault" subtitle="Your encryption keys are created in this browser.">
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <TextField label="Your name" autoComplete="name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Work email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="grid gap-2">
          <PasswordInput
            label="Master password"
            autoComplete="new-password"
            required
            hint="Tip: four or more random, unrelated words are strong and easy to remember."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {password && <StrengthMeter strength={strength} />}
        </div>
        <PasswordInput
          label="Confirm master password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
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
            Vaultessa can’t see or reset your master password. If you forget it, your data can’t be recovered.
            <div className="mt-2 flex items-center gap-2">
              <Checkbox id={ackId} checked={acknowledged} onCheckedChange={(v) => setAcknowledged(v === true)} />
              <Label htmlFor={ackId} className="text-sm font-normal text-foreground">
                I understand and have stored it somewhere safe
              </Label>
            </div>
          </AlertDescription>
        </Alert>
        <Button type="submit" size="lg" className="w-full" disabled={busy || !ready}>
          {busy && <LoaderCircle className="animate-spin" />}
          {busy ? 'Creating your encryption keys…' : 'Create my vault'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
