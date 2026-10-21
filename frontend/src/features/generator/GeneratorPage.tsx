import { useId, useMemo, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/common/page';
import { StrengthMeter } from '@/components/common/strength-meter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useClipboard } from '@/hooks/useClipboard';
import { DEFAULT_GENERATOR_OPTIONS, estimateStrength, generatePassword, type GeneratorOptions } from '@/lib/crypto';

const TOGGLES: Array<{ key: keyof Omit<GeneratorOptions, 'length'>; label: string }> = [
  { key: 'uppercase', label: 'Uppercase (A–Z)' },
  { key: 'lowercase', label: 'Lowercase (a–z)' },
  { key: 'digits', label: 'Digits (0–9)' },
  { key: 'symbols', label: 'Symbols (!@#…)' },
  { key: 'avoidAmbiguous', label: 'Avoid look-alikes (l, 1, O, 0)' },
];

export function GeneratorPage() {
  const [options, setOptions] = useState(DEFAULT_GENERATOR_OPTIONS);
  const [password, setPassword] = useState(() => generatePassword(DEFAULT_GENERATOR_OPTIONS));
  const strength = useMemo(() => estimateStrength(password), [password]);
  const copy = useClipboard();
  const lengthId = useId();

  function update(next: GeneratorOptions) {
    if (!(next.lowercase || next.uppercase || next.digits || next.symbols)) return; // keep one set on
    setOptions(next);
    setPassword(generatePassword(next));
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <PageHeader title="Password generator" description="Generated on this device with a cryptographically secure random source." />
      <Card>
        <CardContent className="grid gap-6">
          <div className="grid gap-3">
            <output
              aria-label="Generated password"
              className="block break-all rounded-lg border bg-muted/40 p-4 font-mono text-lg leading-relaxed"
            >
              {password}
            </output>
            <StrengthMeter strength={strength} />
            <div className="flex gap-2">
              <Button onClick={() => copy(password, 'Password')}>
                <Copy /> Copy
              </Button>
              <Button variant="outline" onClick={() => setPassword(generatePassword(options))}>
                <RefreshCw /> Regenerate
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={lengthId}>Length</Label>
              <span className="font-mono text-sm tabular-nums">{options.length}</span>
            </div>
            <input
              id={lengthId}
              type="range"
              min={8}
              max={128}
              value={options.length}
              onChange={(e) => update({ ...options, length: Number(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {TOGGLES.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <Label htmlFor={`gen-${key}`} className="font-normal">
                  {label}
                </Label>
                <Switch id={`gen-${key}`} checked={options[key]} onCheckedChange={(v) => update({ ...options, [key]: v })} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
