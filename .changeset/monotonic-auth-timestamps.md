---
"@polyester/sdk": patch
---

fix(auth): Ed25519 API-key signing now allocates strictly increasing `X-API-TIMESTAMP` values, so concurrent requests in the same millisecond no longer share a timestamp and risk replay rejection on strict servers.
