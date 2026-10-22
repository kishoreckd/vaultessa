import { useCallback, useRef, useState } from 'react';

type Checks<K extends string> = Partial<Record<K, string | null | false | undefined>>;

/**
 * Inline form validation: call `validate({...})` on submit. It shows each message under its field,
 * moves focus to the first invalid field and returns false if anything failed.
 * Pair with `noValidate` on the <form> so the browser's own popups never appear.
 */
export function useFormErrors<K extends string>() {
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Partial<Record<K, string>>>({});

  const validate = useCallback((checks: Checks<K>) => {
    const next = Object.fromEntries(Object.entries(checks).filter(([, v]) => !!v)) as Partial<Record<K, string>>;
    setErrors(next);
    const ok = Object.keys(next).length === 0;
    if (!ok) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    return ok;
  }, []);

  /** Clear one field's message as soon as the user edits it. */
  const clear = useCallback((key: K) => {
    setErrors((e) => {
      if (!(key in e)) return e;
      const rest = { ...e };
      delete rest[key];
      return rest;
    });
  }, []);

  return { formRef, errors, validate, clear };
}
