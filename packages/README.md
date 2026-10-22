# Vaultessa developer access

In Vaultessa, choose **Account menu → Developer access**, create an expiring token,
and select the items the pipeline needs. Copy the displayed token to your CI secret
store. The token root is shown once; only its independent derived auth proof reaches
the machine API. Items are decrypted locally. Never log token values or secret data.

Both SDKs expect the web app's origin, e.g. `https://vault.example`, without `/api`.
Use HTTPS except when testing against localhost. Redirects are rejected. The clients
support the current `v1` AES-GCM ciphertext format; future formats need SDK updates.

## CLI / Node (Node 20+)

Run directly from the repository, or install the local package:

```powershell
npm install ./packages/sdk-js
```

Set `VAULTESSA_URL` and `VAULTESSA_TOKEN` using your shell or CI secret store.

```text
node packages/sdk-js/cli.mjs list
node packages/sdk-js/cli.mjs get ITEM_ID password
node packages/sdk-js/cli.mjs run --map API_TOKEN=ITEM_ID:fields.token -- node build.mjs
```

`list` prints item IDs, names and types. `get` deliberately prints the requested
secret; only run it in a trusted terminal. `run` launches the command directly,
without a shell, and injects mapped strings into its environment. The Vaultessa
token is removed from the child environment. Choose field paths matching the item:
login passwords are `password`; type-specific values live in `fields`.

When `GITHUB_ACTIONS=true`, `get`/`run` emit escaped `add-mask` commands before
printing or injecting values. Applications must still avoid logging derived or
transformed secrets, which exact-value masking cannot reliably protect.

```javascript
import { VaultessaClient } from '@vaultessa/sdk';
const client = new VaultessaClient({
  url: process.env.VAULTESSA_URL,
  token: process.env.VAULTESSA_TOKEN,
});
const item = await client.get('ITEM_ID');
// Use item.data without logging it.
```

## Python (Python 3.10+)

```text
pip install ./packages/sdk-python
```

```python
import os
from vaultessa import VaultessaClient

client = VaultessaClient(os.environ['VAULTESSA_URL'], os.environ['VAULTESSA_TOKEN'])
item = client.get('ITEM_ID')
# Use item['data'] without logging it.
```

These are local packages; they have not been published to npm or PyPI.

## Verification

`node --test packages/sdk-js/test.mjs`

`backend/.venv/Scripts/python.exe packages/sdk-python/test_sdk.py`

The browser tests, Node tests and Python tests share a synthetic interoperability
fixture at `packages/test-vectors.json`. It contains no live credentials.

## JSON transport

Machine API responses now use `{ status, message, data }`. Both SDKs unwrap the
`data` array before decrypting and reject malformed/non-success envelopes. Upgrade
the API and repository SDKs together; older clients expecting a bare array need updating.
