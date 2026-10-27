# Password health

Strength scoring uses local zxcvbn dictionaries and pattern matching, loaded on demand.
Reuse is computed from accessible decrypted passwords. Login-only shares and failed
decryptions are excluded. Item age and expiry do not reduce the score.

The percentage is the share of checked items with no detected issue, counting each
item once. It is not a probability of safety. Exposed passwords are prioritized,
followed by overlapping weakness/reuse. Older items are informational only.

## Optional exposure lookup

The user must explicitly press the Have I Been Pwned check button after reading the
disclosure. There are no automatic checks or lookups while typing. The browser hashes
each password locally with SHA-1 (only for this API lookup), sends the first five hex
characters to `https://api.pwnedpasswords.com/range/`, and compares suffixes locally.
Requests use `Add-Padding: true`, omit cookies and referrers, and time out after eight
seconds. The external service receives the browser's IP address and hash prefix.
See https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange.

Repeated passwords/prefixes are deduplicated during a scan. Inputs and results are
held only in component/scan memory, never persisted, logged, sent to our backend,
or included in analytics. Checks cancel on leaving the view or refreshing vault
data. A result is used only if its password still matches that item's current value.
Failures are unknown, not negative matches; coverage is displayed separately from
the local checks. Finding a password in breach data does not establish that this
particular account was breached. No match does not establish safety.

Tests mock the external service and use public fixtures; they do not submit vault
passwords to the service. No HIBP account or API key is needed for the range endpoint.
