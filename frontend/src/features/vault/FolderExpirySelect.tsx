import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DURATIONS, type DurationValue } from '../shares/hooks';

export type MemberDuration = 'none' | DurationValue;
export function memberExpiry(value: MemberDuration): string | null {
  if (value === 'none') return null;
  const duration = DURATIONS.find((duration) => duration.value === value);
  if (!duration) throw new Error('Choose a valid expiry');
  return new Date(Date.now() + duration.ms).toISOString();
}

export function FolderExpirySelect({
  value,
  onChange,
  label,
  disabled,
  keep,
}: {
  value: MemberDuration | 'keep';
  onChange: (value: MemberDuration) => void;
  label: string;
  disabled?: boolean;
  keep?: string;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(value) => {
        if (value !== 'keep') onChange(value as MemberDuration);
      }}
    >
      <SelectTrigger className="min-h-11 w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {keep && <SelectItem value="keep">{keep}</SelectItem>}
        <SelectItem value="none">No expiry</SelectItem>
        {DURATIONS.map((duration) => (
          <SelectItem key={duration.value} value={duration.value}>
            {duration.label} from now
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
