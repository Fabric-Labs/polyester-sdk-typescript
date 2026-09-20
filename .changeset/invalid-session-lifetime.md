---
"@polyester/sdk": patch
---

Return zero from `getSessionTimeToExpiry()` for malformed JWTs even when their payload contains a future expiration.
