---
"@polyester/sdk": patch
---

Return typed SDK errors for credential-provider failures, validate Ed25519 secret keys before signing, sign after user interceptors finalize unary requests, reject unsupported Connect stream signing, align raw retry classification with mapped errors, parse Retry-After safely, and reject query strings in Connect API base URLs.
