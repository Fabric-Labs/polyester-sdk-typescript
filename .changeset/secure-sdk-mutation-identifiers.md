---
"@polyester/sdk": patch
---

Require Web Crypto for generated trading-withdraw nonces and order mutation request IDs, with a secure random-byte fallback when `randomUUID` is unavailable.
