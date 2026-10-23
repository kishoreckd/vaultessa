# API layer

- `client.ts`: shared fetch transport, refresh coordination, response decoding and errors.
- `<feature>/api.ts`: typed HTTP functions for that domain.
- `<feature>/types.ts`: request/response DTOs and wire-format enums.

Import directly from the domain, for example `@/api/auth/api` or
`@/api/vault/types`. Do not add a global endpoints/types barrel. Pages and hooks
consume these modules; caching, UI feedback and decryption belong to feature logic.
The browser URL prefix `/api` is independent of this source folder.

Run `npm run check:api`, `npm test` and `npm run build` before pushing changes.
The contract checker needs backend Python dependencies but no database connection.
