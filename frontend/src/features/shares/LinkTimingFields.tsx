import { useId } from 'react';
import { Clock, Eye } from 'lucide-react';
import { FormField } from '@/components/common/form-field';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { DURATIONS, VIEW_LIMITS, type DurationValue, type LinkMode, type ViewLimit } from './hooks';

export type LinkTimingValue = { mode: LinkMode; duration: DurationValue; viewLimit: ViewLimit };

export const DEFAULT_TIMING: LinkTimingValue = { mode: 'once', duration: '24h', viewLimit: 'unlimited' };

/** One-time vs time-limited access, expiry and view limit — shared by "create" and "re-open". */
export function LinkTimingFields({ value, onChange }: { value: LinkTimingValue; onChange: (v: LinkTimingValue) => void }) {
  const id = useId();
  const set = (patch: Partial<LinkTimingValue>) => onChange({ ...value, ...patch });

  return (
    <div className="grid gap-3">
      <Label className="text-sm font-medium">How long can they view it?</Label>
      <RadioGroup value={value.mode} onValueChange={(v) => set({ mode: v as LinkMode })} className="grid gap-2 sm:grid-cols-2">
        {(
          [
            { mode: 'once', icon: Eye, title: 'One-time view', body: 'Deleted right after it’s opened.' },
            { mode: 'period', icon: Clock, title: 'For a period', body: 'Can be reopened until it expires.' },
          ] as const
        ).map(({ mode, icon: Icon, title, body }) => (
          <Label
            key={mode}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors',
              value.mode === mode ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
            )}
          >
            <RadioGroupItem value={mode} className="mt-0.5" />
            <span className="grid gap-0.5">
              <span className="flex items-center gap-1.5 font-medium">
                <Icon className="size-4" /> {title}
              </span>
              <span className="text-xs text-muted-foreground">{body}</span>
            </span>
          </Label>
        ))}
      </RadioGroup>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id={`${id}-duration`} label={value.mode === 'once' ? 'Must be opened within' : 'Available for'}>
          <Select value={value.duration} onValueChange={(v) => set({ duration: v as DurationValue })}>
            <SelectTrigger id={`${id}-duration`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        {value.mode === 'period' && (
          <FormField id={`${id}-views`} label="Maximum views">
            <Select value={value.viewLimit} onValueChange={(v) => set({ viewLimit: v as ViewLimit })}>
              <SelectTrigger id={`${id}-views`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIEW_LIMITS.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v === 'unlimited' ? 'Unlimited' : `${v} views`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
      </div>
    </div>
  );
}
