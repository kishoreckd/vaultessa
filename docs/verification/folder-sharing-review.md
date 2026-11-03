# Folder-sharing verification — 3 November 2026

The folder-sharing implementation and the repository's existing automated checks were reviewed locally on Windows against Docker PostgreSQL. This is an engineering assessment, not an independent security certification or a production performance guarantee.

## Findings and fixes

- Bulk moves previously fetched/updated encryption-key records individually. Moving 1,000 items required 3,004–4,005 SQL statements. Batched delete/upsert now requires 4–5 statements, and a regression test caps each measured service operation at eight statements.
- Folder member counts previously aggregated memberships across the entire database. Aggregation now restricts its work to folders visible to the requesting user.
- Each shared item previously repeated the same folder-key RSA operation. The vault loader now unwraps a folder key once per load, bounds concurrent item decryption to 16, and does not persist or globally cache decrypted keys. Tests verify cross-load cache isolation, wrong-recipient rejection, corrupt-item isolation, and raw item-key erasure on exceptions.
- Incoming shared-folder names no longer reserve names in the recipient's private vault. Folder-name processing now uses linear lookups instead of repeated array searches, and rename avoids an extra folder-list request.
- Folder deletion now takes the same owner lock used by membership changes and moves. Tests exercise concurrent duplicate grants and atomic rejection of incomplete bulk key-wrapper requests.
- Inherited permissions now use an explicit typed dataclass rather than an untyped namespace. The sharing UI and related crypto/hooks were formatted with pinned Prettier 3.6.2. The two existing backend lint failures were fixed.
- The recipient error is connected to its input with accessible error attributes. Long sharing titles can wrap on narrow layouts. Runtime accessibility and mobile visual behaviour remain unverified.

## Local measurements

Synthetic ciphertext fixtures were used. SQL timings include the SQLAlchemy service call and transaction commit; they exclude HTTP transport, per-item API audit events, and browser decryption. Individual timings vary with CPU and concurrent test activity. Query counts are the stable regression metric.

| Operation | Before | After |
| --- | --- | --- |
| Move 1,000 items out | 3,004 statements; 5,468.9 ms | 4 statements; 293.8–306.9 ms |
| Move 1,000 items in | 4,005 statements; 6,318.7 ms | 5 statements; 304.9–403.6 ms |
| List 1,000 inherited items | — | 4 statements; 144.4–159.7 ms |
| List visible folders | — | 3 statements; 13.5–16.3 ms |
| Decrypt 100 shared items in Node Web Crypto | 100 RSA operations; 124.1 ms in one run | 1 RSA operation; 31.6 ms in the same run |

A short in-process FastAPI load sample used 16 authenticated requests, four concurrent workers, and a 1,000-item recipient vault: median 601.3 ms, sampled p95 914.1 ms, approximately 6.4 requests/second, with all responses successful. This small sample is not a network benchmark, a sustained stress test, or a capacity estimate.

The production build passes the artifact-size budgets. Shared entry JavaScript is approximately 177.5 KiB gzip; the vault route is approximately 18.3 KiB gzip and now has a 30 KiB budget. Existing build warnings remain for the large lazily loaded password-strength dictionary and the mixed static/dynamic auth-flow import. Passing size budgets does not establish good LCP, INP, CLS, or real-device responsiveness.

## Automated verification

- Backend Ruff lint passes repository-wide. Ruff formatting passes for all application files and the affected tests.
- Frontend strict TypeScript and production build pass.
- The full frontend suite passes: 189 tests in 31 files.
- The complete backend suite passes: 194 tests, including folder performance, short concurrent load, permission, atomicity and concurrency checks. One existing Starlette/AnyIO deprecation warning remains.
- Browser API contracts pass: 89 operations and 95 request/response assertions.
- Node SDK: four tests pass. Python SDK: three tests pass.
- Prettier checks pass for the reviewed folder-sharing UI, crypto, hooks, concurrency helper, and related new tests.
- `git diff --check` passes.
- Frontend `npm audit`, including development dependencies, reports zero known vulnerabilities at the time of this run.
- Backend tests construct the test database through the actual Alembic migrations. A production migration, rollback rehearsal, and hosted deployment smoke test were not performed.

Reproduce local service/load measurements from `backend` with `.venv/Scripts/python.exe -m pytest tests/test_folder_performance.py -s`. Run the frontend checks with `npm run typecheck`, `npm test`, `npm run check:api`, `npm run build`, and `npm run check:performance`.

## Open security findings

The installed backend environment does **not** have a clean dependency audit. `pip-audit` reported 48 advisory entries across four packages, containing 31 distinct advisory IDs. Repeated IDs and aliases can describe the same underlying vulnerability, so these are not 48 independently established exploitable flaws. The environment includes development tools.

| Package | Installed version | Distinct advisory IDs |
| --- | --- | --- |
| cryptography | 44.0.2 | 6 |
| PyJWT | 2.10.1 | 17 |
| Starlette | 0.46.2 | 7 |
| pytest (development) | 8.3.5 | 1 |

The direct runtime versions match existing repository pins; Starlette is a FastAPI dependency. These findings predate the folder-sharing changes. [The saved audit summary](backend-dependency-audit.json) records the IDs, aliases, and fix versions returned by the scanner. Applicability and exploitability have not been individually verified. Do not blindly upgrade Starlette outside FastAPI's supported dependency range: a compatible stack update needs its own regression run.

Folder revocation removes server access, but folder and item encryption keys are not rotated. Previously retrieved keys and secrets cannot be erased. Already-open plaintext is not remotely wiped. New folder members can access existing item history because versions reuse the item key. The existing global user lookup also retains its documented account-enumeration concern. An independent cryptographic review and penetration test remain outstanding.

## Unverified areas

- Mobile/desktop browser interaction, visual layout, keyboard/focus behaviour, screen readers, contrast, and zoom.
- iOS/Android devices and cross-browser behaviour.
- Lighthouse, real-user Core Web Vitals, network throttling, browser memory/CPU profiling, and battery impact.
- Sustained load, multi-tenant capacity, hosted database plans and p95 latency, and deployment/rollback behaviour.
- Complete threat modelling, exploitability triage, penetration testing, and cryptographic key rotation.

The browser access host was unavailable. The native Windows fallback is excluded by the [computer-use skill](C:/Users/CXO/.codex/plugins/cache/openai-bundled/computer-use/26.1027.51404/skills/computer-use/SKILL.md): “Do not automate password manager apps or password manager websites.” Static inspection and component markup tests do not replace these runtime checks.

## Scores

These are qualitative engineering judgements for the reviewed feature and the observed checks. They are not test coverage percentages, Lighthouse scores, security certifications, or scores for every line of the project. Unmeasured areas receive no numerical score.

| Area | Score / 10 | Basis and limit |
| --- | --- | --- |
| Coding practices and maintainability | 8 | Typed boundaries, independent grants, service/API/crypto separation; broad hooks and some existing architectural debt remain. |
| Formatting and static checks | 9 | Repository backend lint and reviewed formatting pass; there is no repository-wide frontend ESLint gate. |
| Automated correctness and regression testing | 8 | Full suites, contracts, concurrency, atomicity, wrong keys and SDK checks pass; browser end-to-end coverage remains missing. |
| Measured local performance | 8 | Query explosion fixed, bounded crypto work, local load sample and build budgets pass; production/device performance is unknown. |
| Security readiness | 4 | Permissions and encryption tests pass, but backend advisory triage and upgrades, rotation, and independent review remain open. |
| Mobile UX and runtime accessibility | Not scored | Code reviewed; device, visual, keyboard and assistive-technology verification unavailable. |
| Production performance and deployment | Not scored | No hosted measurements or deployment/rollback rehearsal. |
| Overall reviewed engineering state | 7 | Provisional judgement, not an arithmetic average; open security findings prevent a production-readiness sign-off. |

The next release work should prioritise backend dependency triage and compatible upgrades, then browser/device/accessibility verification, hosted performance testing, and a defined key-rotation design.
