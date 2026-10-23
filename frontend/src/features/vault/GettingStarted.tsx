import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Download, KeyRound, Lock, ShieldCheck, StickyNote, WandSparkles, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type SecretType } from '@/api/vault/types';
import { useSession } from '@/stores/session';

/** First-run guidance: concrete next steps instead of an empty screen. */
export function GettingStarted({ onAdd }: { onAdd: (type: SecretType) => void }) {
  const firstName = useSession((s) => s.account?.name.split(' ')[0]);

  const steps: Array<{ icon: LucideIcon; title: string; body: string; action: ReactNode }> = [
    {
      icon: KeyRound,
      title: 'Save your first login',
      body: 'Start with the account you use most — email or work tools.',
      action: <Button onClick={() => onAdd('LOGIN')}>Add a login</Button>,
    },
    {
      icon: StickyNote,
      title: 'Keep cards, notes and Wi-Fi here too',
      body: 'Recovery codes, card details, server keys — each type has the right fields.',
      action: (
        <Button variant="outline" onClick={() => onAdd('SECURE_NOTE')}>
          Add a secure note
        </Button>
      ),
    },
    {
      icon: WandSparkles,
      title: 'Use strong, unique passwords',
      body: 'Generate one whenever you sign up or change a password.',
      action: (
        <Button variant="ghost" asChild>
          <Link to="/generator">
            Open generator <ArrowRight />
          </Link>
        </Button>
      ),
    },
    {
      icon: ShieldCheck,
      title: 'Check your password health',
      body: 'See which passwords are weak or reused, and fix them one by one.',
      action: (
        <Button variant="ghost" asChild>
          <Link to="/vault/security">
            View health <ArrowRight />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Welcome{firstName ? `, ${firstName}` : ''} — let’s set up your vault</CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          <Lock className="size-3.5" /> Everything is encrypted on this device before it’s saved. Not even Vaultessa can read it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3">
          {steps.map(({ icon: Icon, title, body, action }, index) => (
            <li key={title} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <div className="grid flex-1 gap-0.5">
                <p className="text-sm font-medium">
                  <span className="sr-only">Step {index + 1}: </span>
                  {title}
                </p>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
              <div className="shrink-0">{action}</div>
            </li>
          ))}
          <li className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <Download className="size-5" />
            <span className="flex-1">Import from your browser or another password manager</span>
            <Badge variant="secondary">Coming soon</Badge>
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}
