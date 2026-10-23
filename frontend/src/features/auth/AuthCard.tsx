import { useEffect, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { VaultessaLogo } from '@/components/common/brand';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';

export function AuthCard({
  title,
  subtitle,
  children,
  illustration,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  illustration?: ReactNode;
}) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} — Vaultessa`;
    return () => { document.title = previous; };
  }, [title]);
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-12">
      <ThemeToggle className="absolute right-4 top-4" />
      {!illustration && <VaultessaLogo variant="unlock" className="text-xl" />}
      <main className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            {illustration}
            <h1 className="font-heading text-xl font-medium leading-snug">{title}</h1>
            {subtitle && <CardDescription>{subtitle}</CardDescription>}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </main>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        End-to-end encrypted. Vaultessa never sees your master password.
      </p>
    </div>
  );
}
