---
"@polyester/sdk": patch
---

Throw a retryable `NetworkError` when the global `fetch` resolves without a `Response` (for example, when a browser extension patches `fetch`) instead of crashing with a `TypeError` while checking for timestamp-skew errors.
