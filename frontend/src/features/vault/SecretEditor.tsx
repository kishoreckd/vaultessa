import { useId, useState, type FormEvent } from 'react';
import { LoaderCircle, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Drawer } from '@/components/common/drawer';
import { FormField, TextareaField, TextField } from '@/components/common/form-field';
import { PasswordInput } from '@/components/common/password-input';
import { GeneratorPanel } from '@/features/generator/GeneratorPanel';
import { StrengthMeter } from '@/components/common/strength-meter';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SECRET_TYPES, type SecretType } from '@/lib/api/types';
import { DEFAULT_GENERATOR_OPTIONS, estimateStrength, generatePassword } from '@/lib/crypto';
import { cn } from '@/lib/utils';
import { useFormErrors } from '@/hooks/useFormErrors';
import { normalizeUrl, urlError } from '@/lib/validation';
import { useSaveSecret } from './hooks';
import { cleanPayload, getField, setField, TEMPLATES, type FieldDef } from './secretTemplates';
import type { DecryptedFolder, DecryptedItem, SecretPayload } from './vaultTypes';

const NO_FOLDER = 'none';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: DecryptedItem;
  folders: DecryptedFolder[];
  defaultFolderId: string | null;
  defaultType?: SecretType;
  onSaved?: (id: string) => void;
};

/** Create / edit an item in a right-side drawer. */
export function SecretEditorDrawer({ open, onOpenChange, existing, ...rest }: Props) {
  const formId = useId();
  const save = useSaveSecret();
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={existing ? `Edit “${existing.data.name}”` : 'New item'}
      description={
        <span className="flex items-center gap-1.5">
          <Lock className="size-3.5" /> Encrypted on this device before it’s saved.
        </span>
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={save.isPending}>
            {save.isPending && <LoaderCircle className="animate-spin" />}
            {save.isPending ? 'Saving…' : existing ? 'Save changes' : 'Save item'}
          </Button>
        </>
      }
    >
      {open && (
        <SecretForm
          key={existing?.id ?? `new-${rest.defaultType}`}
          formId={formId}
          existing={existing}
          save={save}
          onDone={(id) => {
            onOpenChange(false);
            rest.onSaved?.(id);
          }}
          {...rest}
        />
      )}
    </Drawer>
  );
}

function SecretForm({
  formId,
  existing,
  folders,
  defaultFolderId,
  defaultType = 'LOGIN',
  save,
  onDone,
}: Omit<Props, 'open' | 'onOpenChange' | 'onSaved'> & {
  formId: string;
  save: ReturnType<typeof useSaveSecret>;
  onDone: (id: string) => void;
}) {
  const [type, setType] = useState<SecretType>(existing?.type ?? defaultType);
  const [data, setData] = useState<SecretPayload>(existing?.data ?? { name: '' });
  const [folderId, setFolderId] = useState<string | null>(existing ? existing.folderId : defaultFolderId);
  const [expiry, setExpiry] = useState(() => {
    if (!existing?.expiresAt) return '';
    const date = new Date(existing.expiresAt);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const template = TEMPLATES[type];
  const { formRef, errors, validate, clear } = useFormErrors<string>();
  const update = (key: string) => (value: string) => {
    setData((d) => setField(d, key, value));
    clear(key);
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const checks: Record<string, string | null> = {
      name: data.name.trim() ? null : 'Give this item a name.',
      expiry: !expiry || Number.isFinite(Date.parse(expiry)) ? null : 'Choose a valid expiry date and time.',
    };
    for (const f of template.fields) {
      const value = getField(data, f.key) ?? '';
      checks[f.key] = f.link ? urlError(value) : (f.validate?.(value) ?? null);
    }
    if (!validate(checks)) return;

    // "github.com" → "https://github.com" so links in the detail view work.
    let payload = data;
    for (const f of template.fields) {
      const value = getField(data, f.key);
      if (f.link && value) payload = setField(payload, f.key, normalizeUrl(value) ?? value);
    }
    const item = await save.mutateAsync({ existing, type, data: cleanPayload(payload), folderId,
      expiresAt: expiry ? new Date(expiry).toISOString() : null });
    toast.success(existing ? 'Changes saved' : `${template.label} saved`, {
      description: existing ? undefined : `“${data.name.trim()}” is now in your vault.`,
    });
    onDone(item.id);
  }

  return (
    <form id={formId} ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-5">
      {existing ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <template.icon className="size-4" /> {template.label}
        </div>
      ) : (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">What are you saving?</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {SECRET_TYPES.map((t) => {
              const option = TEMPLATES[t];
              const active = t === type;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={option.description}
                  onClick={() => {
                    setType(t);
                    validate({});
                  }}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    active
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  <option.icon className="size-5" />
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">{template.description}</p>
        </fieldset>
      )}

      <TextField
        label="Name"
        required
        maxLength={200}
        autoFocus
        placeholder={type === 'LOGIN' ? 'e.g. GitHub' : `e.g. ${template.label}`}
        value={data.name}
        error={errors.name}
        onChange={(e) => {
          setData((d) => ({ ...d, name: e.target.value }));
          clear('name');
        }}
      />

      {template.fields.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={getField(data, field.key) ?? ''}
          error={errors[field.key]}
          onChange={update(field.key)}
        />
      ))}

      <TextareaField
        label={template.notesLabel}
        rows={type === 'SECURE_NOTE' ? 8 : 3}
        value={data.notes ?? ''}
        onChange={(e) => setData((d) => ({ ...d, notes: e.target.value }))}
      />
      <TextField label="Item expiry (your local time)" type="datetime-local" value={expiry} error={errors.expiry}
        onChange={(event) => { setExpiry(event.target.value); clear('expiry'); }}
        hint="Optional. The expiry date is stored as scheduling metadata. Reminder emails go to the owner; names and passwords remain encrypted. Changing a password does not automatically update its expiry." />

      <FormField id={`${formId}-folder`} label="Folder">
        <Select value={folderId ?? NO_FOLDER} onValueChange={(v) => setFolderId(v === NO_FOLDER ? null : v)}>
          <SelectTrigger id={`${formId}-folder`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_FOLDER}>No folder</SelectItem>
            {folders.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
    </form>
  );
}

function FieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: FieldDef;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  if (field.multiline) {
    return (
      <TextareaField
        label={field.label}
        error={error}
        rows={field.secret ? 5 : 3}
        spellCheck={false}
        placeholder={field.placeholder}
        className={cn(field.mono && '[&_textarea]:font-mono [&_textarea]:text-xs')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (field.secret) {
    return (
      <div className="grid gap-2">
        <PasswordInput
          label={field.label}
          error={error}
          autoComplete="new-password"
          placeholder={field.placeholder}
          className={cn(field.mono && '[&_input]:font-mono')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onGenerate={
            field.generate ? () => onChange(generatePassword(DEFAULT_GENERATOR_OPTIONS)) : undefined
          }
        />
        {field.generate && value && <StrengthMeter strength={estimateStrength(value)} />}
        {field.generate && (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Password options</summary>
            <div className="pt-4">
              <GeneratorPanel onUse={onChange} />
            </div>
          </details>
        )}
      </div>
    );
  }
  return (
    <TextField
      label={field.label}
      error={error}
      inputMode={field.link ? 'url' : undefined}
      autoComplete="off"
      spellCheck={false}
      placeholder={field.placeholder}
      className={cn(field.mono && '[&_input]:font-mono')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
