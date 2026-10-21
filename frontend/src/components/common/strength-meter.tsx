import type { Strength } from '@/lib/crypto';
import { cn } from '@/lib/utils';

const FILL = ['bg-destructive', 'bg-destructive', 'bg-warning', 'bg-success', 'bg-success'];

export function StrengthMeter({ strength, className }: { strength: Strength; className?: string }) {
  return (
    <div className={cn('grid gap-1', className)} aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full',
              i <= strength.score && strength.entropyBits > 0 ? FILL[strength.score] : 'bg-muted',
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Strength: <span className="font-medium text-foreground">{strength.label}</span>
        {strength.entropyBits > 0 && ` · ~${strength.entropyBits} bits`}
      </p>
    </div>
  );
}
