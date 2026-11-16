import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import QRCode from 'qrcode';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { Copy, Mail, ShieldCheck, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { accountApi } from '@/api/account/api';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import { authDestination } from '@/lib/auth-destination';
import { useClipboard } from '@/hooks/useClipboard';
import { useSession } from '@/stores/session';
import { AuthCard } from './AuthCard';

type Step = 'choose' | 'totp' | 'codes';

export function SecureAccountPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const account = useSession((state) => state.account);
  const copy = useClipboard();
  const [step, setStep] = useState<Step>('choose');
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string }>();
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (setup)
      void QRCode.toDataURL(setup.otpauthUri, { width: 220, margin: 1 })
        .then((value) => active && setQr(value))
        .catch(() => active && setQr(''));
    return () => {
      active = false;
    };
  }, [setup]);

  const finish = () => {
    if (account) sessionStorage.removeItem(`security-setup:${account.id}`);
    navigate(authDestination(location.state), { replace: true });
  };

  const showCodes = (recoveryCodes: string[] | null) => {
    setCodes(recoveryCodes ?? []);
    setStep('codes');
    toast.success('Two-step sign-in is on');
  };

  return (
    <AuthCard
      title="Secure your account"
      subtitle="Choose how Vaultessa should confirm it is you after your master password."
    >
      <div className="grid gap-4">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {step === 'choose' && (
          <>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              <ShieldCheck className="mr-2 inline size-4" />
              An authenticator works even when email delivery is delayed.
            </div>
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 p-4"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError('');
                void accountApi.setupTotp()
                  .then((value) => {
                    setSetup(value);
                    setStep('totp');
                  })
                  .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not start authenticator setup.'))
                  .finally(() => setBusy(false));
              }}
            >
              <Smartphone className="size-5" /> Authenticator app
            </Button>
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 p-4"
              disabled={busy}
              onClick={() => {
                if (!account?.emailVerified) {
                  navigate('/verify-email', { state: location.state });
                  return;
                }
                setBusy(true);
                setError('');
                void accountApi.enableEmailMfa()
                  .then((value) => showCodes(value.recoveryCodes))
                  .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not enable email codes.'))
                  .finally(() => setBusy(false));
              }}
            >
              <Mail className="size-5" /> Email code
            </Button>
            <Button variant="ghost" disabled={busy} onClick={finish}>Skip for now</Button>
          </>
        )}
        {step === 'totp' && setup && (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!/^\d{6}$/.test(code)) {
                setError('Enter the six-digit code from your authenticator app.');
                return;
              }
              setBusy(true);
              setError('');
              void accountApi.enableTotp(code)
                .then((value) => showCodes(value.recoveryCodes))
                .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not verify the code.'))
                .finally(() => setBusy(false));
            }}
          >
            {qr && <img className="mx-auto rounded-lg bg-white p-2" src={qr} width={220} height={220} alt="Authenticator QR code" />}
            <code className="break-all rounded border p-3 text-center text-sm">{setup.secret}</code>
            <div className="grid gap-2">
              <Label htmlFor="secure-account-code">Authenticator code</Label>
              <InputOTP id="secure-account-code" maxLength={6} pattern={REGEXP_ONLY_DIGITS} value={code} onChange={setCode} disabled={busy}>
                <InputOTPGroup>{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} />)}</InputOTPGroup>
              </InputOTP>
            </div>
            <Button type="submit" disabled={busy}>Verify and enable</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setStep('choose')}>Back</Button>
          </form>
        )}
        {step === 'codes' && (
          <>
            <p className="text-sm text-muted-foreground">Save these one-time recovery codes outside Vaultessa.</p>
            <pre className="rounded border p-4 text-sm">{codes.join('\n')}</pre>
            <Button variant="outline" onClick={() => void copy(codes.join('\n'), 'Recovery codes')}><Copy /> Copy recovery codes</Button>
            <Button onClick={finish}>I saved my codes</Button>
          </>
        )}
      </div>
    </AuthCard>
  );
}
