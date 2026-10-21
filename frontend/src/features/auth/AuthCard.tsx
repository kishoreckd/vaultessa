import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { VaultessaLogo } from '@/components/common/brand';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-12">
      <ThemeToggle className="absolute right-4 top-4" />
      <VaultessaLogo variant="unlock" className="text-xl" />
      <main className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">{title}</CardTitle>
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
