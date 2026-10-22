import { useState } from 'react';
import { toast } from 'sonner';
import { Drawer } from '@/components/common/drawer';
import { PasswordInput } from '@/components/common/password-input';
import { Button } from '@/components/ui/button';
import { changeMasterPassword } from '../auth/authFlows';

export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const clear = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError('');
  };
  return (
    <>
      <Button variant="outline" className="mt-4" onClick={() => setOpen(true)}>
        Change master password
      </Button>
      <Drawer
        open={open}
        onOpenChange={(value) => {
          if (!busy) {
            setOpen(value);
            if (!value) clear();
          }
        }}
        title="Change master password"
        description="Your vault key is re-encrypted on this device. Other devices will be signed out."
      >
        <form
          noValidate
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setError('');
            if (!current) {
              setError('Enter your current master password.');
              return;
            }
            if (next.normalize('NFKC').length < 12) {
              setError('Use at least 12 characters for the new password.');
              return;
            }
            if (next.normalize('NFKC') === current.normalize('NFKC')) {
              setError('Choose a different master password.');
              return;
            }
            if (next !== confirm) {
              setError('The new passwords do not match.');
              return;
            }
            setBusy(true);
            try {
              await changeMasterPassword(current, next);
              clear();
              setOpen(false);
              toast.success('Master password changed. Other devices signed out.');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not change master password.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <PasswordInput
            label="Current master password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoComplete="current-password"
          />
          <PasswordInput
            label="New master password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            autoComplete="new-password"
            hint="At least 12 characters. A long, unique passphrase works well."
          />
          <PasswordInput
            label="Confirm new master password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
          />
          <Button disabled={busy} type="submit">
            {busy ? 'Changing password…' : 'Change master password'}
          </Button>
        </form>
      </Drawer>
    </>
  );
}
