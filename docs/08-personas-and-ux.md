# 08 — Personas, UX Principles & Design System

A password manager succeeds or fails on two feelings: **"I trust this with everything"** and
**"this is faster than what I did before."** Every screen should earn both. This doc defines who we
design for, what each person needs, and the rules that turn that into UI.

---

## 1. Personas

### P1 · Priya — the everyday individual (Free / personal plan)
| | |
| --- | --- |
| **Who** | 34, marketing manager. Uses ~120 sites. Not technical. Has reused the same 3 passwords for years. |
| **Context** | Laptop at work, phone everywhere. Signs up after a "your account was breached" email. |
| **Goals** | Stop reusing passwords; never get locked out; feel safe without learning security jargon. |
| **Frustrations** | Fear of forgetting the master password; jargon ("KDF", "RSA"); empty apps that don't say what to do next; long forms. |
| **Key tasks** | Create account → add first logins → copy a password → see if her passwords are weak. |
| **Success looks like** | Adds 10 logins in the first session and fixes her weakest password within a week. |
| **Design implications** | Plain-language explanations; guided first run; reassuring tone around master password; a single "password health" score she can improve; copy feedback she can see. |

### P2 · Arjun — the team member / daily user (Standard–Professional)
| | |
| --- | --- |
| **Who** | 27, support engineer. Opens the vault 20+ times a day for shared tool accounts. |
| **Context** | Desktop, two monitors, keyboard-heavy, always in a hurry (a customer is waiting). |
| **Goals** | Find a credential and copy it in ≤ 3 seconds; know who to ask when he lacks access. |
| **Frustrations** | Clicking into an item just to copy; not knowing who shared something; auto-lock interrupting him every few minutes; modal-heavy flows. |
| **Key tasks** | Search → copy username → copy password; check what's shared with him; edit a shared item he's allowed to. |
| **Success looks like** | Median "search-to-copy" under 3 s; zero support tickets asking "who owns this login?". |
| **Design implications** | Search always one key away (`/`); copy actions directly in the list; full keyboard navigation; "Shared by …" on every shared item; configurable auto-lock; toasts instead of dialogs. |

### P3 · Meera — the IT admin / super admin (Professional–Enterprise, Phase 2+)
| | |
| --- | --- |
| **Who** | 41, IT lead for a 200-person company. Owns onboarding/offboarding and the security audit. |
| **Context** | Desktop; answers to auditors and the CISO; does bulk work on Mondays. |
| **Goals** | Provision people and groups fast; enforce policies; prove who accessed what; offboard without losing credentials. |
| **Frustrations** | No overview; one-by-one operations; audit logs nobody can read; ex-employees still having access. |
| **Key tasks** | Invite users → assign groups → share folders → set policies → review reports → transfer ownership on exit. |
| **Success looks like** | Offboarding in < 5 minutes; audit report exported in one click. |
| **Design implications** | Separate admin area with dashboards; bulk selection; human-readable audit trail with filters and export; clear permission language; destructive actions with explicit, named confirmations. |

### P4 · Rahul — the developer / DevOps power user
| | |
| --- | --- |
| **Who** | 30, backend developer. Stores API keys, SSH keys, DB/server credentials. Skeptical of security claims. |
| **Context** | Keyboard first, terminal open, dark mode everywhere. |
| **Goals** | Store non-website secrets with the right fields; verify the crypto is real; automate (CLI/API later). |
| **Frustrations** | Everything forced into "username + password + URL"; no monospace for keys; marketing-speak instead of specifics. |
| **Key tasks** | Add SSH key / API key / server with host+port → copy a single field → check encryption parameters. |
| **Success looks like** | Moves his `.env` secrets and SSH keys in; recommends Vaultessa to his team. |
| **Design implications** | Type-specific templates (card, bank, SSH key, API key, server, Wi-Fi, identity); monospace secret fields; per-field copy; keyboard shortcuts with a `?` cheat sheet; a settings page that states KDF/cipher parameters honestly; dark mode (planned). |

### P5 · Lakshmi — accessibility & low-vision user (cross-cutting)
| | |
| --- | --- |
| **Who** | 52, finance controller; uses 200% zoom and occasionally a screen reader. |
| **Goals** | Complete every task without a mouse and without guessing what icons mean. |
| **Design implications** | WCAG 2.1 AA contrast; every icon button has a text label or `aria-label`; visible focus rings; live regions for "copied"/"saved"; no information conveyed by colour alone; works at 200% zoom and on a 360 px wide screen. |

### P6 · Compliance auditor (Enterprise, Phase 4) — secondary
Read-only access to reports; needs exports (CSV/PDF), date ranges and tamper-evident logs. No vault access.

---

## 2. Persona → feature matrix

| Feature | Priya | Arjun | Meera | Rahul | Phase |
| --- | :-: | :-: | :-: | :-: | --- |
| Guided first run / getting started | ●●● | ● | ● | ● | **P0 ✅** |
| Copy from list + toasts + clipboard countdown | ●● | ●●● | ● | ●●● | **P0 ✅** |
| Keyboard shortcuts + `?` cheat sheet | | ●●● | ● | ●●● | **P0 ✅** |
| Type-specific item templates | ● | ●● | ●● | ●●● | **P0 ✅** |
| Password health dashboard (weak / reused / old) | ●●● | ● | ●●● | ● | **P0 ✅** (lite) |
| "Shared by …" + plain-language permissions | ● | ●●● | ●●● | ● | **P0 ✅** |
| Show/hide + Caps Lock warning on master password | ●●● | ●● | ● | ● | **P0 ✅** |
| Configurable auto-lock & clipboard timeout | ● | ●●● | ●● | ●● | **P0 ✅** (admin-enforced in P2) |
| Readable activity timeline | ●● | ● | ●●● | ● | **P0 ✅** |
| Mobile-friendly vault (list ↔ detail) | ●●● | ● | | ● | **P0 ✅** |
| Import from browser / other managers | ●●● | ● | ●● | ●● | P1 |
| Dark mode | | ●● | | ●●● | P1 |
| Master password change, 2FA, sessions page | ●● | ● | ●●● | ●● | P1 |
| Admin console, groups, bulk actions, reports | | | ●●● | | P2 |
| Browser extension autofill | ●●● | ●●● | ● | ●● | P3 |
| Access requests ("ask the owner") | | ●●● | ●●● | ● | P4 |

---

## 3. Key journeys (and where they used to break)

**J1 · Priya's first 5 minutes**
Register → (was: dense form, no guidance) → now: live requirement checklist, Caps Lock warning,
plain-language "we can't recover this" acknowledgement → empty vault (was: "Your vault is empty") →
now: *Getting started* card with 3 concrete next steps → adds a login → toast "Saved" → health score appears.

**J2 · Arjun copies a shared credential**
`/` → type "jira" → `↓` → `c` copies password (toast: "Password copied · clears in 30 s") →
done in ~2 s without touching the mouse or opening the item. If he only has *Login only*, the
password copy is hidden and the item says *Shared by Meera* so he knows whom to ask.

**J3 · Rahul stores an SSH key**
New item → type *SSH key* → fields: Host, Username, Private key (monospace, multiline, masked),
Public key, Passphrase → each field has its own copy button in the detail view.

**J4 · Priya improves her password health**
Security page → score 62/100 → "8 reused passwords" → click an item → editor opens with the
generator one click away → score updates immediately.

**J5 · Meera offboards a user (Phase 2)** — documented here so the admin IA is designed up front:
Admin → Users → select → "Offboard" wizard: revoke sessions → transfer owned secrets → list shares
the user had → confirm with the user's email typed out.

---

## 4. UX principles

1. **Speed is a security feature.** If the safe path is slower than a sticky note, people use the sticky note. Optimise search-to-copy above everything else.
2. **Explain once, in plain words, at the moment it matters.** "Only you can unlock your vault — we can't reset this password" beats a security whitepaper.
3. **Never lose work, never surprise.** Edit conflicts show a clear message; destructive actions name exactly what will happen ("Delete *GitHub* for 3 people").
4. **Feedback for every action.** Copy, save, share, delete → a toast (announced to screen readers). No silent success.
5. **Calm, honest security cues.** Show weaknesses with a path to fix them; never fear-monger; state real parameters (PBKDF2-SHA256, 600,000 iterations, AES-256-GCM).
6. **Progressive disclosure.** Simple defaults for Priya, power features (shortcuts, templates, per-field copy) discoverable for Rahul and Arjun.
7. **Accessible by default.** Keyboard and screen reader paths are part of "done", not a follow-up.

---

## 5. Information architecture

```
Personal area (all users)
├── Vault            all items · favourites · shared with me · folders · search
├── Security         password health score, weak / reused / old lists
├── Generator        passwords (passphrases in P1)
├── Activity         readable timeline of your sign-ins and changes
└── Settings         auto-lock, clipboard, account & encryption info, shortcuts

Admin area (Phase 2, role-gated)
├── Overview         org health, seats, policy compliance
├── Users & groups   invite, bulk actions, offboard wizard
├── Shared folders
├── Policies         password, master password, session, IP
└── Reports          access, sharing, audit export
```

---

## 6. Design system (web vault)

**Tokens (Tailwind)**
| Token | Value | Use |
| --- | --- | --- |
| Brand | `indigo-600` / hover `indigo-500` | primary actions, focus rings, active nav |
| Surface | `white` on `slate-50`; cards `ring-1 ring-slate-200 rounded-lg shadow-sm` | |
| Text | `slate-900` primary, `slate-600` secondary, `slate-500` meta (≥ 4.5:1 on white) | |
| Success / Warning / Danger | `green-600` / `amber-600` / `red-600` with 50-tint backgrounds | health badges, toasts |
| Radius | `rounded-md` controls, `rounded-lg` cards, `rounded-xl` auth card | |
| Type | system UI stack; `font-mono` for secrets, keys, hosts | |
| Spacing | 4-px grid; cards `p-5/p-6`; list rows `py-3 px-4` | |

**Components** (`frontend/src/components/`): `Button` (primary / secondary / danger / ghost),
`TextField`, `TextAreaField`, `SelectField`, `PasswordField` (show/hide + Caps Lock), `Modal`
(native `<dialog>`), `confirmAction()` (styled confirm), `toast()` + `Toaster`, `Icon`, `StrengthMeter`,
`Spinner`, `ErrorBanner`, `ItemAvatar` (vault).

**Item templates** (`features/vault/secretTemplates.ts`) define per-type fields, labels, which are
secret/monospace/multiline, and the list subtitle — the single place to add a new secret type.

## 7. Content style guide
- Sentence case everywhere ("New item", not "New Item").
- Verbs on buttons ("Save", "Share", "Copy password"), never "OK".
- Say what happened and what's next: "Password copied · clears in 30 s".
- Errors: what went wrong + what to do. Never blame the user; never reveal whether an email exists.
- Avoid jargon in Priya-facing copy; put exact technical detail in Settings → Encryption for Rahul.

## 8. Accessibility checklist (definition of done)
- [ ] Every interactive element reachable and operable by keyboard; visible focus ring.
- [ ] Icon-only buttons have `aria-label`; decorative icons `aria-hidden`.
- [ ] Toasts in an `aria-live="polite"` region; errors use `role="alert"`.
- [ ] Contrast ≥ 4.5:1 for text; status never conveyed by colour alone (icon + text).
- [ ] Layout works at 360 px width and 200 % zoom.
- [ ] Modals trap focus and close on Esc (native `<dialog>`).

## 9. UX metrics to instrument (privacy-preserving, P1)
Time-to-first-item, search-to-copy time, % items with weak/reused passwords over time,
share acceptance rate, auto-lock interruptions per day. **Never** log item names, URLs or values.
