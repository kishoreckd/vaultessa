import { useStrengthEstimator } from '@/hooks/useStrengthEstimator';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StrengthMeter } from '@/components/common/strength-meter';
import { useClipboard } from '@/hooks/useClipboard';
import { generatePassword, generatePassphrase, passphraseStrength, estimateStrength } from '@/lib/crypto';

const GROUPS = [
  ['A–Z', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
  ['a–z', 'abcdefghijklmnopqrstuvwxyz'],
  ['0–9', '0123456789'],
  ['# $ % & @ ^ ~', '#$%&@^~'],
  ['{ [ ( | ) ] }', '{[(|)]}'],
  ['. , : ;', '.,:;'],
  ['Quotes', '\'"`'],
  ['/ \\ _ -', '/\\_-'],
  ['< * + ! ? =', '<*+!?='],
  ['Emoji', '😀🚀🌈🔒⭐🍀🎈🐬'],
] as const;

export function GeneratorPanel({ onUse }: { onUse?: (value: string) => void }) {
  useStrengthEstimator();
  const id = useId();
  const [mode, setMode] = useState('password');
  const [length, setLength] = useState(20);
  const [count, setCount] = useState(8);
  const [separator, setSeparator] = useState('-');
  const [groups, setGroups] = useState<number[]>([0, 1, 2, 3]);
  const [avoid, setAvoid] = useState(false);
  const [value, setValue] = useState(() =>
    generatePassword({
      length: 20,
      uppercase: true,
      lowercase: true,
      digits: true,
      symbols: true,
      avoidAmbiguous: false,
    }),
  );
  const copy = useClipboard();
  const generate = (
    kind = mode,
    size = length,
    words = count,
    sep = separator,
    selected = groups,
    ambiguous = avoid,
  ) => {
    setValue(
      kind === 'passphrase'
        ? generatePassphrase(words, sep)
        : generatePassword({
            length: size,
            lowercase: true,
            uppercase: true,
            digits: true,
            symbols: true,
            avoidAmbiguous: ambiguous,
            characterGroups: selected.map((i) => GROUPS[i]![1]),
          }),
    );
  };
  return (
    <div className="grid gap-4">
      <Tabs
        value={mode}
        onValueChange={(next) => {
          setMode(next);
          generate(next);
        }}
      >
        <TabsList>
          <TabsTrigger value="password">Password</TabsTrigger>
          <TabsTrigger value="passphrase">Passphrase</TabsTrigger>
        </TabsList>
      </Tabs>
      <output
        aria-label="Generated password"
        className="break-all rounded-lg border bg-muted/40 p-3 font-mono"
      >
        {value}
      </output>
      <StrengthMeter strength={mode === 'passphrase' ? passphraseStrength(count) : estimateStrength(value)} />
      {mode === 'password' ? (
        <>
          <label htmlFor={`${id}-length`} className="text-sm font-medium">
            Length: {length} characters
          </label>
          <div className="flex items-center gap-3">
            <input
              id={`${id}-length`}
              className="w-full accent-primary"
              type="range"
              min={12}
              max={128}
              value={length}
              onChange={(e) => {
                const n = Number(e.target.value);
                setLength(n);
                generate(mode, n);
              }}
            />
            <Input
              aria-label="Password length"
              type="number"
              className="w-24"
              min={12}
              max={128}
              value={length}
              onChange={(e) => {
                const n = Math.min(128, Math.max(12, Number(e.target.value) || 12));
                setLength(n);
                generate(mode, n);
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {GROUPS.map(([label], i) => (
              <Button
                key={label}
                type="button"
                size="sm"
                variant={groups.includes(i) ? 'default' : 'outline'}
                aria-pressed={groups.includes(i)}
                onClick={() => {
                  const next = groups.includes(i) ? groups.filter((n) => n !== i) : [...groups, i];
                  if (!next.length) return;
                  setGroups(next);
                  generate(mode, length, count, separator, next);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={avoid}
              onChange={(e) => {
                setAvoid(e.target.checked);
                generate(mode, length, count, separator, groups, e.target.checked);
              }}
            />{' '}
            Avoid look-alike characters
          </label>
          {groups.includes(9) && (
            <p className="text-xs text-muted-foreground">Some websites do not accept emoji in passwords.</p>
          )}
        </>
      ) : (
        <>
          <label className="grid gap-2 text-sm">
            Words: {count}
            <input
              className="accent-primary"
              type="range"
              min={6}
              max={16}
              value={count}
              onChange={(e) => {
                const n = Number(e.target.value);
                setCount(n);
                generate(mode, length, n);
              }}
            />
          </label>
          <label className="grid gap-2 text-sm">
            Separator
            <Select
              value={separator}
              onValueChange={(value) => {
                setSeparator(value);
                generate(mode, length, count, value);
              }}
            >
              <SelectTrigger className="w-full" aria-label="Separator"><SelectValue /></SelectTrigger>
              <SelectContent>
              {['-', ' ', '.', '_'].map((s) => (
                <SelectItem key={s} value={s}>
                  {s === ' ' ? 'Space' : s}
                </SelectItem>
              ))}
              </SelectContent>
            </Select>
          </label>
          <p className="text-xs text-muted-foreground">
            Uses a local dictionary and secure randomness. Eight or more words are recommended.
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => generate()}>
          Regenerate
        </Button>
        <Button type="button" variant="outline" onClick={() => void copy(value, 'Password')}>
          Copy
        </Button>
        {onUse && (
          <Button type="button" onClick={() => onUse(value)}>
            Use this password
          </Button>
        )}
      </div>
    </div>
  );
}
