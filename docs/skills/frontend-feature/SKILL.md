---
name: frontend-feature
description: How to add a page, feature, component or API hook to the Vaultessa web vault (React 19, Vite, Tailwind 4, Zustand, TanStack Query). Use when working in frontend/src.
---

# Adding a frontend feature

## Layout
```
frontend/src/
  lib/api/<module>.ts       typed calls to the backend (uses apiFetch from client.ts)
  lib/crypto/               all crypto — never call crypto.subtle elsewhere
  stores/session.ts         in-memory keys + account; lock() wipes everything
  features/<feature>/       pages, feature components, hooks
  components/               shared UI (Button, Input, Modal, AppLayout)
```

## Steps
1. **API** — add functions + types in `lib/api/<module>.ts`. Types mirror `docs/05-api-spec.md`.
2. **Hook** — wrap in TanStack Query (`useQuery` / `useMutation`) inside the feature folder.
   Decrypt inside the `queryFn` or a `select`, using keys from `useSession.getState()`.
   Invalidate the relevant query keys on mutation success.
3. **Page/component** — Tailwind utility classes; use shared `Button`, `Input`, `Modal`.
4. **Route** — add to `src/App.tsx` inside the protected layout if it needs an unlocked vault.
5. **Nav** — add a link in `components/AppLayout.tsx` if it's top-level.

## Design first
Load the `ux-personas` skill before building UI: name the persona and their job, reuse
`components/` (`Button`, `IconButton`, `PasswordField`, `Modal`, `toast`, `confirmAction`, `Icon`),
and add new secret types only in `features/vault/secretTemplates.ts`.

## Rules
- Decrypted values only in component state / query cache. No `localStorage` for anything sensitive.
- Sensitive inputs: `autoComplete="off"` (or `new-password` for generators), `spellCheck={false}`.
- Copy-to-clipboard via `useClipboard()` (toast + auto-clear per user preference).
- Feedback via `toast()`; destructive actions via `confirmAction()` — never `window.confirm`/`alert`.
- Show user-facing errors from `ApiError.message`; never render raw server payloads as HTML.
- Accessibility: labels for every input, focus trapped in modals, buttons have text or `aria-label`.
- Run `npm run typecheck && npm test` in `frontend/` before finishing.
