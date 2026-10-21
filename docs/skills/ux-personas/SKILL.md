---
name: ux-personas
description: Persona-driven UI/UX rules for Vaultessa screens — who we design for (Priya the everyday user, Arjun the daily team user, Meera the admin, Rahul the developer, Lakshmi the accessibility user), the design system, content style and accessibility definition of done. Use before designing or changing any page, component, copy text or flow in frontend/src.
---

# Designing Vaultessa UI

Full reference: `docs/08-personas-and-ux.md`. Read the persona section before a new feature.

## Before building, answer in the PR/notes
1. Which persona(s) is this for, and what is their job-to-be-done?
2. What's the fastest path for Arjun (keyboard, fewest clicks)?
3. What does Priya need explained, in plain words, at that moment?
4. What does Rahul need to trust it (exact facts, monospace, per-field copy)?
5. How does Lakshmi complete it with keyboard + screen reader only?

## Rules
- Reuse components from `frontend/src/components/` (`Button`, `TextField`, `PasswordField`, `Modal`,
  `toast`, `confirmAction`, `Icon`). Don't hand-roll dialogs, `window.confirm`, or `alert`.
- Every action gives feedback via `toast()`; destructive actions use `confirmAction()` with a
  specific title naming the thing affected.
- New secret types/fields go in `features/vault/secretTemplates.ts` only.
- Copy: sentence case, verbs on buttons, "what happened · what's next". No jargon in user-facing
  copy except Settings → Encryption.
- Secrets: masked by default, `font-mono`, per-field copy, `autoComplete="off"`/`"new-password"`.
- Keyboard: register shortcuts with `useHotkeys`; list them in the `?` cheat sheet (`ShortcutsDialog`).
- Accessibility DoD: focusable + visible focus, `aria-label` on icon buttons, live region feedback,
  no colour-only status, works at 360 px and 200 % zoom.
- Preferences that are not secrets (auto-lock, clipboard timeout) live in `lib/prefs.ts`; nothing
  decrypted ever goes to storage.
