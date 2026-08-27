---
"@polyester/sdk": patch
---

Return typed SDK errors for credential-provider failures across HTTP and realtime, reject private realtime subscriptions immediately when a synchronous JWT provider has no token, preserve JWT authentication visibility and overrides in user interceptors, validate Ed25519 secret keys before signing, sign API-key requests after user interceptors finalize unary messages, reject unsupported Connect stream signing, align raw retry classification with mapped errors, parse Retry-After safely, and reject query strings in Connect API base URLs.
